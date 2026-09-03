import type {
  EngineInputEvent,
  EngineOutputEvent,
  PlaceOrderCommandEvent,
  CancelOrderCommandEvent,
  IndexPriceUpdatedEvent,
  UserCreatedEvent,
  BalanceDepositedEvent,
  OrderStatus,
  Side,
} from "@repo/events";
import { SCHEMA_VERSION } from "@repo/events";
import {
  createState,
  deserialize,
  serialize,
  type EngineState,
  type MarketConfig,
  type RestingOrder,
  type SerializedState,
} from "./state";
import { q } from "./money";
import { credit, ensureBalance, lock, release } from "./balances";
import { applyFill, ensurePosition, getPosition, liquidationSweep, markToMarket } from "./positions";
import {
  bestPrice,
  cancelResting,
  insertResting,
  removeEmptyLevel,
  snapshot,
} from "./book";
import { requiredMargin } from "./risk";

export interface ReduceContext {
  /** Redis stream id of the input event, recorded as lastInputId. */
  streamId: string;
}

type DraftOutput = Pick<EngineOutputEvent, "eventType"> & { payload: unknown };

const MAX_APPLIED_COMMANDS = 50_000;

export class Engine {
  constructor(public state: EngineState) {}

  static create(market: MarketConfig): Engine {
    return new Engine(createState(market));
  }

  static fromSnapshot(s: SerializedState): Engine {
    return new Engine(deserialize(s));
  }

  snapshot(): SerializedState {
    return serialize(this.state);
  }

  bookSnapshot(levels = 20) {
    return snapshot(this.state, levels);
  }

  private nextSeq(): number {
    this.state.seq += 1;
    return this.state.seq;
  }

  /**
   * The single deterministic state-transition entrypoint.
   * Same state + same event sequence => same resulting state and outputs.
   */
  process(event: EngineInputEvent, ctx: ReduceContext): EngineOutputEvent[] {
    const alreadyApplied =
      event.commandId !== undefined &&
      this.state.appliedCommandIds.includes(event.commandId);

    let drafts: DraftOutput[] = [];
    if (!alreadyApplied) {
      drafts = this.dispatch(event);
      if (event.commandId !== undefined) this.recordCommand(event.commandId);
      this.state.appliedCount += 1;
    }
    this.state.lastInputId = ctx.streamId;

    return drafts.map((d) => this.stamp(d, event));
  }

  private recordCommand(commandId: string): void {
    this.state.appliedCommandIds.push(commandId);
    if (this.state.appliedCommandIds.length > MAX_APPLIED_COMMANDS) {
      this.state.appliedCommandIds.splice(
        0,
        this.state.appliedCommandIds.length - MAX_APPLIED_COMMANDS,
      );
    }
  }

  private stamp(d: DraftOutput, src: EngineInputEvent): EngineOutputEvent {
    return {
      eventId: `evt_${this.nextSeq()}`,
      eventType: d.eventType,
      ts: src.ts,
      source: "engine",
      schemaVersion: SCHEMA_VERSION,
      correlationId: src.correlationId,
      causationId: src.eventId,
      commandId: src.commandId,
      payload: d.payload,
    } as EngineOutputEvent;
  }

  private dispatch(event: EngineInputEvent): DraftOutput[] {
    switch (event.eventType) {
      case "user.created":
        return this.onUserCreated(event);
      case "balance.deposited":
        return this.onBalanceDeposited(event);
      case "order.place":
        return this.onPlaceOrder(event);
      case "order.cancel":
        return this.onCancelOrder(event);
      case "index_price.updated":
        return this.onIndexPrice(event);
    }
  }

  /* ------------------------------- handlers ------------------------------- */

  private onUserCreated(e: UserCreatedEvent): DraftOutput[] {
    const { userId, openingBalance } = e.payload;
    ensureBalance(this.state, userId);
    if (openingBalance > 0) credit(this.state, userId, openingBalance);
    return [this.balanceDraft(userId)];
  }

  private onBalanceDeposited(e: BalanceDepositedEvent): DraftOutput[] {
    const { userId, amount } = e.payload;
    ensureBalance(this.state, userId);
    credit(this.state, userId, amount);
    return [this.balanceDraft(userId)];
  }

  private onPlaceOrder(e: PlaceOrderCommandEvent): DraftOutput[] {
    const o = e.payload;
    const reject = (reason: string): DraftOutput[] => [
      { eventType: "order.rejected", payload: { orderId: o.orderId, userId: o.userId, reason } },
      { eventType: "command.rejected", payload: { commandId: e.commandId ?? o.orderId, reason } },
    ];

    if (!this.state.balances.has(o.userId)) return reject("user does not exist");
    if (o.leverage <= 0 || o.leverage > this.state.market.maxLeverage)
      return reject(`leverage must be between 1 and ${this.state.market.maxLeverage}`);
    if (o.margin < this.state.market.minMargin)
      return reject(`margin must be at least ${this.state.market.minMargin}`);

    const refPrice =
      o.orderType === "LIMIT"
        ? o.price
        : bestPrice(this.state, o.side === "Bid" ? "Ask" : "Bid") ?? this.state.markPrice;
    if (refPrice > 0) {
      const minReq = requiredMargin(refPrice, o.quantity, o.leverage);
      if (o.margin + 1e-6 < minReq)
        return reject("margin is insufficient for the requested size and leverage");
    }

    if (!lock(this.state, o.userId, o.margin)) return reject("insufficient free balance");

    const outs: DraftOutput[] = [];
    const affected = new Set<string>([o.userId]);
    const marginPerUnit = o.margin / o.quantity;

    let remaining = o.quantity;
    let filledNotional = 0;
    const makerTouched = new Map<string, { restingQty: number; filled: number; userId: string }>();

    const takerSide: Side = o.side;
    const makerLevels = o.side === "Bid" ? this.state.asks : this.state.bids;

    while (remaining > 1e-9 && makerLevels.length > 0) {
      const level = makerLevels[0]!;
      const crosses =
        o.orderType === "MARKET" ||
        (o.side === "Bid" ? level.price <= o.price : level.price >= o.price);
      if (!crosses) break;

      while (remaining > 1e-9 && level.orders.length > 0) {
        const maker = level.orders[0]!;
        const fillQty = Math.min(remaining, maker.remaining);
        const fillPrice = maker.price;

        const makerFillMargin =
          maker.remaining > 0 ? q((fillQty / maker.remaining) * maker.margin) : 0;
        maker.remaining = q(maker.remaining - fillQty);
        maker.margin = q(maker.margin - makerFillMargin);

        const takerFillMargin = q(fillQty * marginPerUnit);

        applyFill(this.state, maker.userId, maker.side, fillPrice, fillQty, makerFillMargin, maker.leverage);
        applyFill(this.state, o.userId, takerSide, fillPrice, fillQty, takerFillMargin, o.leverage);

        const mt = makerTouched.get(maker.orderId) ?? {
          restingQty: maker.quantity,
          filled: 0,
          userId: maker.userId,
        };
        mt.filled = q(mt.filled + fillQty);
        makerTouched.set(maker.orderId, mt);

        this.state.lastTradePrice = fillPrice;
        remaining = q(remaining - fillQty);
        filledNotional = q(filledNotional + fillPrice * fillQty);
        affected.add(maker.userId);

        outs.push({
          eventType: "trade.executed",
          payload: {
            tradeId: `${this.state.market.symbol}-${this.nextSeq()}`,
            symbol: this.state.market.symbol,
            makerOrderId: maker.orderId,
            takerOrderId: o.orderId,
            makerUserId: maker.userId,
            takerUserId: o.userId,
            price: fillPrice,
            quantity: fillQty,
            takerSide,
            ts: e.ts,
          },
        });

        if (maker.remaining <= 1e-9) level.orders.shift();
      }

      outs.push(this.deltaDraft(maker_side(o.side), level.price));
      removeEmptyLevel(makerLevels, level.price);
    }

    const filled = q(o.quantity - remaining);
    let status: OrderStatus;

    if (o.orderType === "LIMIT" && remaining > 1e-9) {
      const restMargin = q(remaining * marginPerUnit);
      const resting: RestingOrder = {
        orderId: o.orderId,
        userId: o.userId,
        side: o.side,
        price: o.price,
        quantity: remaining,
        remaining,
        leverage: o.leverage,
        margin: restMargin,
        seq: this.nextSeq(),
        ts: e.ts,
      };
      insertResting(this.state, resting);
      outs.push(this.deltaDraft(o.side, o.price));
      status = filled > 0 ? "PARTIAL" : "OPEN";
    } else if (o.orderType === "MARKET" && remaining > 1e-9) {
      release(this.state, o.userId, q(remaining * marginPerUnit));
      status = filled > 0 ? "PARTIAL" : "CANCELLED";
    } else {
      status = "FILLED";
    }

    for (const [makerOrderId, mt] of makerTouched) {
      const remainingMaker = q(mt.restingQty - mt.filled);
      outs.push({
        eventType: "order.accepted",
        payload: {
          orderId: makerOrderId,
          userId: mt.userId,
          status: remainingMaker > 1e-9 ? "PARTIAL" : "FILLED",
          filledQuantity: mt.filled,
          remainingQuantity: Math.max(0, remainingMaker),
          avgFillPrice: 0,
        },
      });
    }

    for (const userId of affected) {
      outs.push(this.balanceDraft(userId));
      outs.push(this.positionDraft(userId));
    }

    outs.push({
      eventType: "order.accepted",
      payload: {
        orderId: o.orderId,
        userId: o.userId,
        status,
        filledQuantity: filled,
        remainingQuantity: remaining,
        avgFillPrice: filled > 0 ? q(filledNotional / filled) : 0,
      },
    });
    return outs;
  }

  private onCancelOrder(e: CancelOrderCommandEvent): DraftOutput[] {
    const { userId, orderId, side, price } = e.payload;
    const level = (side === "Bid" ? this.state.bids : this.state.asks).find(
      (l) => l.price === price,
    );
    const target = level?.orders.find((x) => x.orderId === orderId);
    if (!target || target.userId !== userId) {
      return [
        { eventType: "order.rejected", payload: { orderId, userId, reason: "order not found" } },
        {
          eventType: "command.rejected",
          payload: { commandId: e.commandId ?? orderId, reason: "order not found" },
        },
      ];
    }
    const removed = cancelResting(this.state, side, price, orderId)!;
    const released = release(this.state, userId, removed.margin);
    return [
      this.deltaDraft(side, price),
      this.balanceDraft(userId),
      { eventType: "order.cancelled", payload: { orderId, userId, releasedMargin: released } },
    ];
  }

  private onIndexPrice(e: IndexPriceUpdatedEvent): DraftOutput[] {
    if (e.payload.observerSeq <= this.state.lastObserverSeq) return [];
    this.state.lastObserverSeq = e.payload.observerSeq;
    markToMarket(this.state, e.payload.price);

    const liquidations = liquidationSweep(this.state, e.payload.price);
    const outs: DraftOutput[] = [];
    for (const liq of liquidations) {
      outs.push({ eventType: "position.liquidated", payload: liq });
      outs.push(this.balanceDraft(liq.userId));
      outs.push(this.positionDraft(liq.userId));
    }
    return outs;
  }

  /* ------------------------------- drafts -------------------------------- */

  private balanceDraft(userId: string): DraftOutput {
    const b = ensureBalance(this.state, userId);
    return {
      eventType: "balance.updated",
      payload: { userId, total: b.total, free: b.free, locked: b.locked },
    };
  }

  private positionDraft(userId: string): DraftOutput {
    const p = getPosition(this.state, userId) ?? ensurePosition(this.state, userId);
    return {
      eventType: "position.updated",
      payload: {
        userId,
        size: p.size,
        entryPrice: p.entryPrice,
        margin: p.margin,
        leverage: p.leverage,
        liqPrice: p.liqPrice,
        realizedPnl: p.realizedPnl,
        unrealizedPnl: p.unrealizedPnl,
        markPrice: p.markPrice,
      },
    };
  }

  private deltaDraft(side: Side, price: number): DraftOutput {
    const levels = side === "Bid" ? this.state.bids : this.state.asks;
    const level = levels.find((l) => l.price === price);
    const newQuantity = level ? level.orders.reduce((s, o) => s + o.remaining, 0) : 0;
    return {
      eventType: "orderbook.delta",
      payload: { symbol: this.state.market.symbol, side, price, newQuantity },
    };
  }
}

function maker_side(takerSide: Side): Side {
  return takerSide === "Bid" ? "Ask" : "Bid";
}
