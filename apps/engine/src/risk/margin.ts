export function notional(price: number, quantity: number): number {
  return price * quantity;
}

export function requiredMargin(
  price: number,
  quantity: number,
  leverage: number,
): number {
  return notional(price, quantity) / leverage;
}
