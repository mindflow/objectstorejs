import { List } from "coreutil_v1";
import { IndexConfig } from "./indexConfig.js";

export class StoreConfig {

    constructor() {

        /** @type {String} */
        this.storeName = null;

        /** @type {String} */
        this.keyPath = null;

        /** @type {List<IndexConfig>} */
        this.indexList = new List();

    }

    /**
     * 
     * @param {String} storeName 
     */
    withStoreName(storeName) {
        this.storeName = storeName;
        return this;
    }

    /**
     * 
     * @param {String} storeName 
     */
    withKeyPath(keyPath) {
        this.keyPath = keyPath;
        return this;
    }

    /**
     * 
     * @param {String} storeName 
     */
    withIndex(name, path, unique) {
        this.indexList.add(new IndexConfig(name, path, unique));
        return this;
    }

}