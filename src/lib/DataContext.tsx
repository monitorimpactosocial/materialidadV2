import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loadDatasets, getConnection } from './duckdb-client';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

interface DataContextType {
    isLoaded: boolean;
    conn: AsyncDuckDBConnection | null;
    error: string | null;
    reload: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
    isLoaded: false,
    conn: null,
    error: null,
    reload: async () => { },
});

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [conn, setConn] = useState<AsyncDuckDBConnection | null>(null);
    const [error, setError] = useState<string | null>(null);

    const init = async () => {
        try {
            setIsLoaded(false);
            setError(null);
            await loadDatasets();
            const connection = await getConnection();
            setConn(connection);
            setIsLoaded(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Error al cargar la base de datos local");
        }
    };

    useEffect(() => {
        init();
    }, []);

    return (
        <DataContext.Provider value={{ isLoaded, conn, error, reload: init }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => useContext(DataContext);
