import { List } from "coreutil_v1";
import { StoreConfig } from "./storeConfig";

export class DbConfig {


    constructor() {

        /** @type {Number} */
        this.version = 1;

        /** @type {List<StoreConfig} */
        this.storeConfigList = new List();
    }

    /**
     * 
     * @param {Number} version 
     */
     withVersion(version) {
        this.version = version;
        return this;
    }

    /**
     * 
     * @param {StoreConfig} storeConfig 
     */
    withStoreConfig(storeConfig) { 
        this.storeConfigList.add(storeConfig);
        return this;
    }


}