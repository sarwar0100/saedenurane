export type TokenSkin = {
  id: string;
  name: string;
  from: string;
  to: string;
};

export type BoardSkin = {
  id: string;
  name: string;
  colors: [string, string, string];
};

export const tokens: TokenSkin[] = [];

export const boards: BoardSkin[] = [];

export const goldPackages = [
  { id: "p1", gold: 100, price: "0.50" },
  { id: "p2", gold: 400, price: "2.00" },
  { id: "p3", gold: 700, price: "4.99" },
  { id: "p4", gold: 1100, price: "7.99" },
  { id: "p5", gold: 1800, price: "9.99" },
];

export const tokenById = (id: string): TokenSkin | undefined => tokens.find((t) => t.id === id);
export const boardById = (id: string): BoardSkin | undefined => boards.find((b) => b.id === id);
