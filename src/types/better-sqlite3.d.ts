declare module "better-sqlite3" {
  import { Database as DatabaseType } from "better-sqlite3";

  interface Statement {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): IterableIterator<any>;
    bind(...params: any[]): this;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    pragma(pragma: string, options?: { simple?: boolean }): any;
    close(): void;
    transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: any): Database;
    (filename: string, options?: any): Database;
  }

  const BetterSqlite3: DatabaseConstructor;
  export type { Database };
  export default BetterSqlite3;
}
