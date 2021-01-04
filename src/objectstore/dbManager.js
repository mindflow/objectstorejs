import { Map, ObjectFunction } from "coreutil_v1";
import { DBConfigurer } from "./dbConfigurer.js";
import { StoreConfig } from "./storeConfig.js";
import { SubscriptionManager } from "./subscriptionManager.js";

/**
 * Manages a database with 0 to many stores
 */
export class DBManager {

    /**
     * 
     * @param {IDBDatabase} db 
     */
    constructor(db) {
        
        /** @type {IDBDatabase} */
        this.db = db;

        /** @type {Map} */
        this.subscriptionManagerMap = new Map();
    }

    /**
     * 
     * @param {String} dbName 
     * @param {StoreConfig} storeConfig 
     * @return {Promise}
     */
    static fromStore(dbName, storeConfig) {
        const dbConfigurer = new DBConfigurer(storeConfig);
        return new Promise((resolve, reject) => {
            const openRequest = window.indexedDB.open(dbName, 1);
            openRequest.onerror = (error) => {
                LOG.error(error);
                reject(error);
            }
            openRequest.onsuccess = () => {
                resolve(new DBManager(openRequest.result));
            }
            openRequest.onupgradeneeded = dbConfigurer.updgrade.bind(dbConfigurer);
        });
    }

    /**
     * @returns {Object}
     */
    static mapEntity(type, dataObject) {
        if (dataObject) {
            return Object.assign(new type, dataObject);
        }
        return null;
    }


    /**
     * 
     * @param {String} storeName 
     * @param {IDBTransactionMode} transactionType readwrite
     * @returns {IDBTransaction}
     */
    transaction(transactionType, storeName) {
        return this.db.transaction(storeName, transactionType);
    }

    /**
     * 
     * @param {IDBTransaction} transaction
     * @param {String} storeName
     * @returns {IDBOjectStore}
     */
    objectStore(transaction, storeName) {
        return transaction.objectStore(storeName);
    }

    /**
     * 
     * @param {IDBObjectStore} objectStore 
     * @param {String} indexName
     * @returns {IDBIndex}
     */
    index(objectStore, indexName) {
        return objectStore.index(indexName);
    }

    /**
     * @param {Object} entity
     * @param {String} storeName
     * @param {String} transactionType
     * @return {Promise}
     */
    putEntity(entity, storeName) {
        const transaction = this.transaction("readwrite", storeName);
        const store = transaction.objectStore(storeName);
        const putRequest = store.put(entity);
        const context = this;
        return new Promise((resolve, reject) => {
            putRequest.onsuccess = () => { context.notifyPut(entity, storeName); resolve(entity); };
            putRequest.onerror = (error) => { reject(error); };
        });
    }


        /**
     * 
     * @param {String} key 
     * @param {String} storeName
     * @param {Class} type
     * @returns {Promise}
     */
    getEntity(key, type, storeName) {
        const transaction = this.transaction("readonly", storeName);
        const userStore = transaction.objectStore(storeName);
        const getRequest = userStore.get(key);
        return new Promise((resolve, reject) => {
            getRequest.onsuccess = () => { resolve(DBManager.mapEntity(type, getRequest.result)); };
            getRequest.onerror = (error) => { reject(error); };
        });
    }

    /**
     * 
     * @param {String} key 
     * @returns {Promise}
     */
    deleteEntity(key, storeName) {
        const transaction = this.transaction("readwrite", storeName);
        const store = transaction.objectStore(storeName);
        const deleteRequest = store.delete(key);
        const context = this;
        return new Promise((resolve, reject) => {
            deleteRequest.onsuccess = () => {  context.notifyDelete(key, storeName); resolve(deleteRequest.result); };
            deleteRequest.onerror = (error) => {reject(error); };
        });
    }

    notifyDelete(key, storeName) {
        if (this.subscriptionManagerMap.contains(storeName)) {
            this.subscriptionManagerMap.get(storeName).notifyDelete(key);
        }
    }

    notifyPut(entity, storeName) {
        if (this.subscriptionManagerMap.contains(storeName)) {
            this.subscriptionManagerMap.get(storeName).notifyPut(entity);
        }
    }

    /**
     * Subscribers are weakly referenced. Keep a reference to the 
     * instance of the ObjectFunction to ensure it is not automatically
     * removed.
     * 
     * @type {String} storeName
     * @type {ObjectFunction} objectFunction
     */
    subscribePut(storeName, objectFunction) {
        if (!this.subscriptionManagerMap.contains(storeName)) {
            this.subscriptionManagerMap.set(storeName, new SubscriptionManager());
        }
        this.subscriptionManagerMap.get(storeName).subscribe(objectFunction);
    }

    /**
     * Subscribers are weakly referenced. Keep a reference to the 
     * instance of the ObjectFunction to ensure it is not automatically
     * removed.
     * 
     * @type {String} storeName
     * @type {ObjectFunction} putObjectFunction
     * @type {ObjectFunction} deleteObjectFunction
     */
    subscribe(putObjectFunction, deleteObjectFunction, storeName) {
        if (!this.subscriptionManagerMap.contains(storeName)) {
            this.subscriptionManagerMap.set(storeName, new SubscriptionManager());
        }
        this.subscriptionManagerMap.get(storeName).subscribe(putObjectFunction, deleteObjectFunction);
    }

}