export function createLoopBackId(length: number) {
  const random = "ahsdgfjwenapjnmncvpeiuitetiglkadfmcvnbhjothpogpas";
  let result = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * random.length);
    if (!random[index]) {
      return;
    }
    result = result + random[index];
  }
  return result;
}
