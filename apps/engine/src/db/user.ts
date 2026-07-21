import type { User } from "../utils/types";
// import tha postion object to verify the user has valid position or not
class Users {
  public users: User[] = [];

  constructor() {}

  getUser(userId: string): User {
    const user = this.users.find((x) => {
      x.userId === userId;
    });
    if (!user) {
      throw new Error("user with this userId does not exist");
    }
    return user;
  }

  getUserBalance(userId: string) {}

  getUserPositions(userId: string) {}

  lockBalance(userId: string, balance: number) {
    return true;
  }
}

const users = new Users();
export default users;
