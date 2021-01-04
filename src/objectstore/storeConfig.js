import { List } from "coreutil_v1";
import { IndexConfig } from "./indexConfig.js";

export class StoreConfig {

        constructor() {

            /** @type {Number} */
            this.version = 1;

            /** @type {String} */
            this.storeName = null;

            /** @type {String} */
            this.keyPath = null;

            /** @type {List} */
            this.indexList = new List();

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