import type { LongShort } from "../utils/types";

class OrderBook {
  public Longs = new Longs();
  public Shorts = new Shorts();

  public maxLevarage = 20;
  public minMargin = 100;

  public longPrice: number[] = [];
  public shortPrice: number[] = [];
  public lastTradePrice: number = 0;

  constructor() {}
}

class Shorts {
  public maps: Map<number, LongShort[]> = new Map();
  public ShortFunction = new LongShortFunction(this.maps);
}

class Longs {
  public maps: Map<number, LongShort[]> = new Map();
  public LongFunction = new LongShortFunction(this.maps);
}

// pass the map to this class and wirte the functional logic

class LongShortFunction {
  public mapLongShort: Map<number, LongShort[]>;
  constructor(mapLongShort: Map<number, LongShort[]>) {
    this.mapLongShort = mapLongShort;
  }

  getBest() {}

  delete() {}

  addSide() {}
}

const orderBook = new OrderBook();
export default orderBook;
