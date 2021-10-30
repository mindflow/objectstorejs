import { Logger } from "coreutil_v1";
import { DbConfig } from "./DbConfig";

const LOG = new Logger("StoreConfig");

export class DBConfigurer {

    /**
     * 
     * @param {DbConfig} dbConfig 
     */
    constructor(dbConfig) {
        this.dbConfig = dbConfig;
    }

    /**
     * 
     * @param {IDBVersionChangeEvent} versionChangeEvent 
     */
    updgrade(versionChangeEvent) {
        LOG.info("Upgrade needed");

        /** @type {IDBDatabase} */
        const db = versionChangeEvent.target.result;

        this.dbConfig.storeConfigList.forEach((storeConfig) => {

            // Clear the old
            if (db.objectStoreNames.contains(storeConfig.storeName)) {
                db.deleteObjectStore(storeConfig.storeName);
            }
    
            // Create the new
            const store = db.createObjectStore(
                storeConfig.storeName, 
                { keyPath: storeConfig.keyPath }
            );
    
            storeConfig.indexList.forEach((indexConfig) => {
                const index = store.createIndex(
                    indexConfig.name, 
                    indexConfig.path, 
                    {unique: indexConfig.unique}
                );
                return true;
            })

            return true;
        });
    }

}