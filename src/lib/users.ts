export type UserRecord = {
  name: string;
  title: string;
  pin: string;
};

export type AuthenticatedUser = Omit<UserRecord, "pin">;

/**
 * Update this list to manage who can edit the stock grid.
 * Ensure PINs remain unique for each user.
 */
export const USERS: UserRecord[] = [
  {
    name: "Jayward",
    title: "CNC Operator",
    pin: "1234"
  },
  {
    name: "Angel",
    title: "CNC Operator",
    pin: "5678"
  },
  {
    name: "Jehan",
    title: "CNC Operator",
    pin: "8765"
  },
  {
    name: "Lucio",
    title: "CNC Operator",
    pin: "4321"
  },
  {
    name: "Steve",
    title: "Factory Manager",
    pin: "0000"
  }      
];