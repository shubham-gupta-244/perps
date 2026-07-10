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
  public Shorts: Map<number, LongShort[]> = new Map();

  constructor() {}

  getBest() {}

  delete() {}

  addSide() {}
}

class Longs {
  public Longs: Map<number, LongShort[]> = new Map();

  constructor() {}

  getBest() {}

  delete() {}

  addSide() {}
}

const orderBook = new OrderBook();
export default orderBook;
