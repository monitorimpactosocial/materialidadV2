import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};

let db: duckdb.AsyncDuckDB | null = null;
let connection: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export async function initDuckDB(): Promise<duckdb.AsyncDuckDB> {
    if (db) return db;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        // Select a bundle based on browser checks
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
        // Instantiate the asynchronus version of DuckDB-wasm
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger();
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        return db;
    })();

    return initPromise;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
    const database = await initDuckDB();
    if (!connection) {
        connection = await database.connect();
    }
    return connection;
}

export async function loadDatasets() {
    const db = await initDuckDB();
    const conn = await getConnection();

    // Load static files from public/data
    const basePath = "/materialidad-dashboard/data";

    try {
        // 1. Fetch files
        const resResp = await fetch(`${basePath}/responses_long.parquet`);
        const resImpact = await fetch(`${basePath}/impact_assessment.csv`);
        const resFin = await fetch(`${basePath}/financial_assessment.csv`);
        const resTema = await fetch(`${basePath}/dim_tema.csv`);

        // 2. Register buffers
        await db.registerFileBuffer('responses_long.parquet', new Uint8Array(await resResp.arrayBuffer()));
        await db.registerFileBuffer('impact_assessment.csv', new Uint8Array(await resImpact.arrayBuffer()));
        await db.registerFileBuffer('financial_assessment.csv', new Uint8Array(await resFin.arrayBuffer()));
        await db.registerFileBuffer('dim_tema.csv', new Uint8Array(await resTema.arrayBuffer()));

        // 3. Create views for querying
        await conn.query(`CREATE OR REPLACE VIEW res AS SELECT * FROM read_parquet('responses_long.parquet')`);
        await conn.query(`CREATE OR REPLACE VIEW imp AS SELECT * FROM read_csv_auto('impact_assessment.csv')`);
        await conn.query(`CREATE OR REPLACE VIEW fin AS SELECT * FROM read_csv_auto('financial_assessment.csv')`);
        await conn.query(`CREATE OR REPLACE VIEW dim AS SELECT * FROM read_csv_auto('dim_tema.csv')`);

    } catch (err) {
        console.error("Error loading datasets:", err);
    }
}
