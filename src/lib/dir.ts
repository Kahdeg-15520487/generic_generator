// ===========================================================================
// Direction system — 8 compass directions with cw/ccw/opposite
// Port of com.watabou.dwellings.utils.Dir
// ===========================================================================

export class Dir {
  constructor(
    public readonly di: number,
    public readonly dj: number,
  ) {}

  // Set during init()
  cw!: Dir;
  ccw!: Dir;
  op!: Dir;

  toString(): string {
    if (this === Dir.N) return "n";
    if (this === Dir.S) return "s";
    if (this === Dir.E) return "e";
    if (this === Dir.W) return "w";
    return "?";
  }

  static N  = new Dir(0, -1);
  static S  = new Dir(0, 1);
  static E  = new Dir(1, 0);
  static W  = new Dir(-1, 0);
  static NE = new Dir(1, -1);
  static NW = new Dir(-1, -1);
  static SE = new Dir(1, 1);
  static SW = new Dir(-1, 1);

  static CARDINAL = [Dir.N, Dir.S, Dir.E, Dir.W] as const;
  static ROSE = [Dir.N, Dir.NE, Dir.E, Dir.SE, Dir.S, Dir.SW, Dir.W, Dir.NW] as const;

  static {
    Dir.N.cw = Dir.E;  Dir.N.ccw = Dir.W;  Dir.N.op = Dir.S;
    Dir.E.cw = Dir.S;  Dir.E.ccw = Dir.N;  Dir.E.op = Dir.W;
    Dir.S.cw = Dir.W;  Dir.S.ccw = Dir.E;  Dir.S.op = Dir.N;
    Dir.W.cw = Dir.N;  Dir.W.ccw = Dir.S;  Dir.W.op = Dir.E;
  }
}
