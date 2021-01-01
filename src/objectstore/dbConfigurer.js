import { Logger } from "coreutil_v1";

const LOG = new Logger("StoreConfig");

export class DBConfigurer {

    /**
     * 
     * @param {StoreConfig} storeConfig 
     */
    constructor(storeConfig) {
        this.storeConfig = storeConfig;
    }

    /**
     * 
     * @param {IDBVersionChangeEvent} versionChangeEvent 
     */
    updgrade(versionChangeEvent) {
        LOG.info("Upgrade needed");

        /** @type {IDBDatabase} */
        const db = versionChangeEvent.target.result;

        if (db.objectStoreNames.contains(this.storeConfig.storeName)) {
            db.deleteObjectStore(this.storeConfig.storeName);
        }

        const store = db.createObjectStore(
            this.storeConfig.storeName, 
            { keyPath: this.storeConfig.keyPath }
        );

        const index = store.createIndex(
            this.storeConfig.indexName, 
            this.storeConfig.indexPath, 
            {unique: this.storeConfig.indexUnique}
        );
    }

}