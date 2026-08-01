export function createLoopBackId(length: number): string {
  const alphabet = "ahsdgfjwenapjnmncvpeiuitetiglkadfmcvnbhjothpogpas";
  let result = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * alphabet.length);
    result += alphabet[index];
  }
  return result;
}
