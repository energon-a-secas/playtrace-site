import { DatabaseSync } from 'node:sqlite';
// D1-compatible adapter for private, offline operator preparation only.
export class LocalD1 {
  constructor(sql){this.sql=new DatabaseSync(':memory:');this.sql.exec(sql);}
  prepare(sql){const db=this;return {sql,args:[],bind(...args){this.args=args;return this;},
    async first(){return db.sql.prepare(sql).get(...this.args)||null;},
    async all(){return {results:db.sql.prepare(sql).all(...this.args)};},
    async run(){const result=db.sql.prepare(sql).run(...this.args);return {meta:{changes:Number(result.changes)},results:[]};}};}
  async batch(statements){this.sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>({results:this.sql.prepare(s.sql).all(...s.args)}));this.sql.exec('COMMIT');return results;}catch(error){this.sql.exec('ROLLBACK');throw error;}}
  close(){this.sql.close();}
}
