'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var coreutil_v1 = require('coreutil_v1');
var containerbridge_v1 = require('containerbridge_v1');

const LOG$1 = new coreutil_v1.Logger("StoreConfig");

class DBConfigurer {

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
        LOG$1.info("Upgrade needed");

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

class IndexConfig {

    /**
     * 
     * @param {String} name 
     * @param {String} path 
     * @param {Boolean} unique 
     */
    constructor(name, path, unique) {

        /** @type {String} */
        this.name = name;

        /** @type {String} */
        this.path = path;

        /** @type {Boolean} */
        this.unique = unique;
    }

}

class StoreConfig {

    constructor() {

        /** @type {Number} */
        this.version = 1;

        /** @type {String} */
        this.storeName = null;

        /** @type {String} */
        this.keyPath = null;

        /** @type {List} */
        this.indexList = new coreutil_v1.List();

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

class SubscriptionManager {

    constructor() {
        this.putSubscribers = new coreutil_v1.List();
        this.deleteSubscribers = new coreutil_v1.List();
    }

    /**
     * Subscribers are weakly referenced. Keep a reference to the 
     * instance of the ObjectFunction to ensure it is not automatically
     * removed.
     * 
     * @param {ObjectFunction} putSubscriber 
     * @param {ObjectFunction} deleteSubscriber 
     */
    subscribe(putSubscriber, deleteSubscriber) {
        if (putSubscriber instanceof coreutil_v1.ObjectFunction) {
            this.putSubscribers.add(new WeakRef(putSubscriber));
        }
        if (deleteSubscriber instanceof coreutil_v1.ObjectFunction) {
            this.deleteSubscribers.add(new WeakRef(deleteSubscriber));
        }
    }

    notifyPut(entity) {
        let toRemoveArray = [];
        this.putSubscribers.forEach((weakRefSubscriber, parent) => {
            /** @type {ObjectFunction} */
            let subscriber = weakRefSubscriber.deref();
            if (!subscriber) {
                toRemoveArray.push(weakRefSubscriber);
            } else {
                subscriber.call(entity);
            }
            return true;
        }, this);
        new coreutil_v1.List(toRemoveArray).forEach((toRemove, parent) => {
            this.putSubscribers.remove(toRemove);
        });
    }

    notifyDelete(key) {
        let toRemoveArray = [];
        this.deleteSubscribers.forEach((weakRefSubscriber, parent) => {
            /** @type {ObjectFunction} */
            let subscriber = weakRefSubscriber.deref();
            if (!subscriber) {
                toRemoveArray.push(weakRefSubscriber);
            } else {
                subscriber.call(key);
            }
            return true;
        }, this);
        new coreutil_v1.List(toRemoveArray).forEach((toRemove, parent) => {
            this.deleteSubscribers.remove(toRemove);
        });
    }

}

/**
 * Manages a database with 0 to many stores
 */
class DBManager {

    /**
     * 
     * @param {IDBDatabase} db 
     */
    constructor(db) {
        
        /** @type {IDBDatabase} */
        this.db = db;

        /** @type {Map} */
        this.subscriptionManagerMap = new coreutil_v1.Map();
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
            const openRequest = containerbridge_v1.ContainerDatabaseStorage.open(dbName, 1);
            openRequest.onerror = (error) => {
                LOG.error(error);
                reject(error);
            };
            openRequest.onsuccess = () => {
                resolve(new DBManager(openRequest.result));
            };
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

exports.DBConfigurer = DBConfigurer;
exports.DBManager = DBManager;
exports.IndexConfig = IndexConfig;
exports.StoreConfig = StoreConfig;
exports.SubscriptionManager = SubscriptionManager;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JqZWN0c3RvcmVfdjEuanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9vYmplY3RzdG9yZS9kYkNvbmZpZ3VyZXIuanMiLCIuLi8uLi9zcmMvb2JqZWN0c3RvcmUvaW5kZXhDb25maWcuanMiLCIuLi8uLi9zcmMvb2JqZWN0c3RvcmUvc3RvcmVDb25maWcuanMiLCIuLi8uLi9zcmMvb2JqZWN0c3RvcmUvc3Vic2NyaXB0aW9uTWFuYWdlci5qcyIsIi4uLy4uL3NyYy9vYmplY3RzdG9yZS9kYk1hbmFnZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcImNvcmV1dGlsX3YxXCI7XG5cbmNvbnN0IExPRyA9IG5ldyBMb2dnZXIoXCJTdG9yZUNvbmZpZ1wiKTtcblxuZXhwb3J0IGNsYXNzIERCQ29uZmlndXJlciB7XG5cbiAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge1N0b3JlQ29uZmlnfSBzdG9yZUNvbmZpZyBcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihzdG9yZUNvbmZpZykge1xuICAgICAgICB0aGlzLnN0b3JlQ29uZmlnID0gc3RvcmVDb25maWc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtJREJWZXJzaW9uQ2hhbmdlRXZlbnR9IHZlcnNpb25DaGFuZ2VFdmVudCBcbiAgICAgKi9cbiAgICB1cGRncmFkZSh2ZXJzaW9uQ2hhbmdlRXZlbnQpIHtcbiAgICAgICAgTE9HLmluZm8oXCJVcGdyYWRlIG5lZWRlZFwiKTtcblxuICAgICAgICAvKiogQHR5cGUge0lEQkRhdGFiYXNlfSAqL1xuICAgICAgICBjb25zdCBkYiA9IHZlcnNpb25DaGFuZ2VFdmVudC50YXJnZXQucmVzdWx0O1xuXG4gICAgICAgIGlmIChkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKHRoaXMuc3RvcmVDb25maWcuc3RvcmVOYW1lKSkge1xuICAgICAgICAgICAgZGIuZGVsZXRlT2JqZWN0U3RvcmUodGhpcy5zdG9yZUNvbmZpZy5zdG9yZU5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi5jcmVhdGVPYmplY3RTdG9yZShcbiAgICAgICAgICAgIHRoaXMuc3RvcmVDb25maWcuc3RvcmVOYW1lLCBcbiAgICAgICAgICAgIHsga2V5UGF0aDogdGhpcy5zdG9yZUNvbmZpZy5rZXlQYXRoIH1cbiAgICAgICAgKTtcblxuICAgICAgICBjb25zdCBpbmRleCA9IHN0b3JlLmNyZWF0ZUluZGV4KFxuICAgICAgICAgICAgdGhpcy5zdG9yZUNvbmZpZy5pbmRleE5hbWUsIFxuICAgICAgICAgICAgdGhpcy5zdG9yZUNvbmZpZy5pbmRleFBhdGgsIFxuICAgICAgICAgICAge3VuaXF1ZTogdGhpcy5zdG9yZUNvbmZpZy5pbmRleFVuaXF1ZX1cbiAgICAgICAgKTtcbiAgICB9XG5cbn0iLCJleHBvcnQgY2xhc3MgSW5kZXhDb25maWcge1xuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggXG4gICAgICogQHBhcmFtIHtCb29sZWFufSB1bmlxdWUgXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobmFtZSwgcGF0aCwgdW5pcXVlKSB7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtTdHJpbmd9ICovXG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtTdHJpbmd9ICovXG4gICAgICAgIHRoaXMucGF0aCA9IHBhdGg7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtCb29sZWFufSAqL1xuICAgICAgICB0aGlzLnVuaXF1ZSA9IHVuaXF1ZTtcbiAgICB9XG5cbn0iLCJpbXBvcnQgeyBMaXN0IH0gZnJvbSBcImNvcmV1dGlsX3YxXCI7XG5pbXBvcnQgeyBJbmRleENvbmZpZyB9IGZyb20gXCIuL2luZGV4Q29uZmlnLmpzXCI7XG5cbmV4cG9ydCBjbGFzcyBTdG9yZUNvbmZpZyB7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcblxuICAgICAgICAvKiogQHR5cGUge051bWJlcn0gKi9cbiAgICAgICAgdGhpcy52ZXJzaW9uID0gMTtcblxuICAgICAgICAvKiogQHR5cGUge1N0cmluZ30gKi9cbiAgICAgICAgdGhpcy5zdG9yZU5hbWUgPSBudWxsO1xuXG4gICAgICAgIC8qKiBAdHlwZSB7U3RyaW5nfSAqL1xuICAgICAgICB0aGlzLmtleVBhdGggPSBudWxsO1xuXG4gICAgICAgIC8qKiBAdHlwZSB7TGlzdH0gKi9cbiAgICAgICAgdGhpcy5pbmRleExpc3QgPSBuZXcgTGlzdCgpO1xuXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHZlcnNpb24gXG4gICAgICovXG4gICAgd2l0aFZlcnNpb24odmVyc2lvbikge1xuICAgICAgICB0aGlzLnZlcnNpb24gPSB2ZXJzaW9uO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3RvcmVOYW1lIFxuICAgICAqL1xuICAgIHdpdGhTdG9yZU5hbWUoc3RvcmVOYW1lKSB7XG4gICAgICAgIHRoaXMuc3RvcmVOYW1lID0gc3RvcmVOYW1lO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3RvcmVOYW1lIFxuICAgICAqL1xuICAgIHdpdGhLZXlQYXRoKGtleVBhdGgpIHtcbiAgICAgICAgdGhpcy5rZXlQYXRoID0ga2V5UGF0aDtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0b3JlTmFtZSBcbiAgICAgKi9cbiAgICB3aXRoSW5kZXgobmFtZSwgcGF0aCwgdW5pcXVlKSB7XG4gICAgICAgIHRoaXMuaW5kZXhMaXN0LmFkZChuZXcgSW5kZXhDb25maWcobmFtZSwgcGF0aCwgdW5pcXVlKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxufSIsImltcG9ydCB7IExpc3QsIE9iamVjdEZ1bmN0aW9uIH0gZnJvbSBcImNvcmV1dGlsX3YxXCI7XG5cbmV4cG9ydCBjbGFzcyBTdWJzY3JpcHRpb25NYW5hZ2VyIHtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnB1dFN1YnNjcmliZXJzID0gbmV3IExpc3QoKTtcbiAgICAgICAgdGhpcy5kZWxldGVTdWJzY3JpYmVycyA9IG5ldyBMaXN0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3Vic2NyaWJlcnMgYXJlIHdlYWtseSByZWZlcmVuY2VkLiBLZWVwIGEgcmVmZXJlbmNlIHRvIHRoZSBcbiAgICAgKiBpbnN0YW5jZSBvZiB0aGUgT2JqZWN0RnVuY3Rpb24gdG8gZW5zdXJlIGl0IGlzIG5vdCBhdXRvbWF0aWNhbGx5XG4gICAgICogcmVtb3ZlZC5cbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge09iamVjdEZ1bmN0aW9ufSBwdXRTdWJzY3JpYmVyIFxuICAgICAqIEBwYXJhbSB7T2JqZWN0RnVuY3Rpb259IGRlbGV0ZVN1YnNjcmliZXIgXG4gICAgICovXG4gICAgc3Vic2NyaWJlKHB1dFN1YnNjcmliZXIsIGRlbGV0ZVN1YnNjcmliZXIpIHtcbiAgICAgICAgaWYgKHB1dFN1YnNjcmliZXIgaW5zdGFuY2VvZiBPYmplY3RGdW5jdGlvbikge1xuICAgICAgICAgICAgdGhpcy5wdXRTdWJzY3JpYmVycy5hZGQobmV3IFdlYWtSZWYocHV0U3Vic2NyaWJlcikpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkZWxldGVTdWJzY3JpYmVyIGluc3RhbmNlb2YgT2JqZWN0RnVuY3Rpb24pIHtcbiAgICAgICAgICAgIHRoaXMuZGVsZXRlU3Vic2NyaWJlcnMuYWRkKG5ldyBXZWFrUmVmKGRlbGV0ZVN1YnNjcmliZXIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG5vdGlmeVB1dChlbnRpdHkpIHtcbiAgICAgICAgbGV0IHRvUmVtb3ZlQXJyYXkgPSBbXTtcbiAgICAgICAgdGhpcy5wdXRTdWJzY3JpYmVycy5mb3JFYWNoKCh3ZWFrUmVmU3Vic2NyaWJlciwgcGFyZW50KSA9PiB7XG4gICAgICAgICAgICAvKiogQHR5cGUge09iamVjdEZ1bmN0aW9ufSAqL1xuICAgICAgICAgICAgbGV0IHN1YnNjcmliZXIgPSB3ZWFrUmVmU3Vic2NyaWJlci5kZXJlZigpO1xuICAgICAgICAgICAgaWYgKCFzdWJzY3JpYmVyKSB7XG4gICAgICAgICAgICAgICAgdG9SZW1vdmVBcnJheS5wdXNoKHdlYWtSZWZTdWJzY3JpYmVyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3Vic2NyaWJlci5jYWxsKGVudGl0eSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIG5ldyBMaXN0KHRvUmVtb3ZlQXJyYXkpLmZvckVhY2goKHRvUmVtb3ZlLCBwYXJlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMucHV0U3Vic2NyaWJlcnMucmVtb3ZlKHRvUmVtb3ZlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgbm90aWZ5RGVsZXRlKGtleSkge1xuICAgICAgICBsZXQgdG9SZW1vdmVBcnJheSA9IFtdO1xuICAgICAgICB0aGlzLmRlbGV0ZVN1YnNjcmliZXJzLmZvckVhY2goKHdlYWtSZWZTdWJzY3JpYmVyLCBwYXJlbnQpID0+IHtcbiAgICAgICAgICAgIC8qKiBAdHlwZSB7T2JqZWN0RnVuY3Rpb259ICovXG4gICAgICAgICAgICBsZXQgc3Vic2NyaWJlciA9IHdlYWtSZWZTdWJzY3JpYmVyLmRlcmVmKCk7XG4gICAgICAgICAgICBpZiAoIXN1YnNjcmliZXIpIHtcbiAgICAgICAgICAgICAgICB0b1JlbW92ZUFycmF5LnB1c2god2Vha1JlZlN1YnNjcmliZXIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdWJzY3JpYmVyLmNhbGwoa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgbmV3IExpc3QodG9SZW1vdmVBcnJheSkuZm9yRWFjaCgodG9SZW1vdmUsIHBhcmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5kZWxldGVTdWJzY3JpYmVycy5yZW1vdmUodG9SZW1vdmUpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbn0iLCJpbXBvcnQgeyBNYXAsIE9iamVjdEZ1bmN0aW9uIH0gZnJvbSBcImNvcmV1dGlsX3YxXCI7XG5pbXBvcnQgeyBDb250YWluZXJEYXRhYmFzZVN0b3JhZ2UgfSBmcm9tIFwiY29udGFpbmVyYnJpZGdlX3YxXCI7XG5pbXBvcnQgeyBEQkNvbmZpZ3VyZXIgfSBmcm9tIFwiLi9kYkNvbmZpZ3VyZXIuanNcIjtcbmltcG9ydCB7IFN0b3JlQ29uZmlnIH0gZnJvbSBcIi4vc3RvcmVDb25maWcuanNcIjtcbmltcG9ydCB7IFN1YnNjcmlwdGlvbk1hbmFnZXIgfSBmcm9tIFwiLi9zdWJzY3JpcHRpb25NYW5hZ2VyLmpzXCI7XG5cbi8qKlxuICogTWFuYWdlcyBhIGRhdGFiYXNlIHdpdGggMCB0byBtYW55IHN0b3Jlc1xuICovXG5leHBvcnQgY2xhc3MgREJNYW5hZ2VyIHtcblxuICAgIC8qKlxuICAgICAqIFxuICAgICAqIEBwYXJhbSB7SURCRGF0YWJhc2V9IGRiIFxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGRiKSB7XG4gICAgICAgIFxuICAgICAgICAvKiogQHR5cGUge0lEQkRhdGFiYXNlfSAqL1xuICAgICAgICB0aGlzLmRiID0gZGI7XG5cbiAgICAgICAgLyoqIEB0eXBlIHtNYXB9ICovXG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uTWFuYWdlck1hcCA9IG5ldyBNYXAoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZGJOYW1lIFxuICAgICAqIEBwYXJhbSB7U3RvcmVDb25maWd9IHN0b3JlQ29uZmlnIFxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9XG4gICAgICovXG4gICAgc3RhdGljIGZyb21TdG9yZShkYk5hbWUsIHN0b3JlQ29uZmlnKSB7XG4gICAgICAgIGNvbnN0IGRiQ29uZmlndXJlciA9IG5ldyBEQkNvbmZpZ3VyZXIoc3RvcmVDb25maWcpO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3BlblJlcXVlc3QgPSBDb250YWluZXJEYXRhYmFzZVN0b3JhZ2Uub3BlbihkYk5hbWUsIDEpO1xuICAgICAgICAgICAgb3BlblJlcXVlc3Qub25lcnJvciA9IChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgIExPRy5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9wZW5SZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG5ldyBEQk1hbmFnZXIob3BlblJlcXVlc3QucmVzdWx0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcGVuUmVxdWVzdC5vbnVwZ3JhZGVuZWVkZWQgPSBkYkNvbmZpZ3VyZXIudXBkZ3JhZGUuYmluZChkYkNvbmZpZ3VyZXIpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICAqL1xuICAgIHN0YXRpYyBtYXBFbnRpdHkodHlwZSwgZGF0YU9iamVjdCkge1xuICAgICAgICBpZiAoZGF0YU9iamVjdCkge1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24obmV3IHR5cGUsIGRhdGFPYmplY3QpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0b3JlTmFtZSBcbiAgICAgKiBAcGFyYW0ge0lEQlRyYW5zYWN0aW9uTW9kZX0gdHJhbnNhY3Rpb25UeXBlIHJlYWR3cml0ZVxuICAgICAqIEByZXR1cm5zIHtJREJUcmFuc2FjdGlvbn1cbiAgICAgKi9cbiAgICB0cmFuc2FjdGlvbih0cmFuc2FjdGlvblR5cGUsIHN0b3JlTmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5kYi50cmFuc2FjdGlvbihzdG9yZU5hbWUsIHRyYW5zYWN0aW9uVHlwZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtJREJUcmFuc2FjdGlvbn0gdHJhbnNhY3Rpb25cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3RvcmVOYW1lXG4gICAgICogQHJldHVybnMge0lEQk9qZWN0U3RvcmV9XG4gICAgICovXG4gICAgb2JqZWN0U3RvcmUodHJhbnNhY3Rpb24sIHN0b3JlTmFtZSkge1xuICAgICAgICByZXR1cm4gdHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoc3RvcmVOYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge0lEQk9iamVjdFN0b3JlfSBvYmplY3RTdG9yZSBcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZXhOYW1lXG4gICAgICogQHJldHVybnMge0lEQkluZGV4fVxuICAgICAqL1xuICAgIGluZGV4KG9iamVjdFN0b3JlLCBpbmRleE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdFN0b3JlLmluZGV4KGluZGV4TmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGVudGl0eVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdG9yZU5hbWVcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdHJhbnNhY3Rpb25UeXBlXG4gICAgICogQHJldHVybiB7UHJvbWlzZX1cbiAgICAgKi9cbiAgICBwdXRFbnRpdHkoZW50aXR5LCBzdG9yZU5hbWUpIHtcbiAgICAgICAgY29uc3QgdHJhbnNhY3Rpb24gPSB0aGlzLnRyYW5zYWN0aW9uKFwicmVhZHdyaXRlXCIsIHN0b3JlTmFtZSk7XG4gICAgICAgIGNvbnN0IHN0b3JlID0gdHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoc3RvcmVOYW1lKTtcbiAgICAgICAgY29uc3QgcHV0UmVxdWVzdCA9IHN0b3JlLnB1dChlbnRpdHkpO1xuICAgICAgICBjb25zdCBjb250ZXh0ID0gdGhpcztcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHB1dFJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4geyBjb250ZXh0Lm5vdGlmeVB1dChlbnRpdHksIHN0b3JlTmFtZSk7IHJlc29sdmUoZW50aXR5KTsgfTtcbiAgICAgICAgICAgIHB1dFJlcXVlc3Qub25lcnJvciA9IChlcnJvcikgPT4geyByZWplY3QoZXJyb3IpOyB9O1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgICAgICAvKipcbiAgICAgKiBcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5IFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdG9yZU5hbWVcbiAgICAgKiBAcGFyYW0ge0NsYXNzfSB0eXBlXG4gICAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAgICovXG4gICAgZ2V0RW50aXR5KGtleSwgdHlwZSwgc3RvcmVOYW1lKSB7XG4gICAgICAgIGNvbnN0IHRyYW5zYWN0aW9uID0gdGhpcy50cmFuc2FjdGlvbihcInJlYWRvbmx5XCIsIHN0b3JlTmFtZSk7XG4gICAgICAgIGNvbnN0IHVzZXJTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHN0b3JlTmFtZSk7XG4gICAgICAgIGNvbnN0IGdldFJlcXVlc3QgPSB1c2VyU3RvcmUuZ2V0KGtleSk7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBnZXRSZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHsgcmVzb2x2ZShEQk1hbmFnZXIubWFwRW50aXR5KHR5cGUsIGdldFJlcXVlc3QucmVzdWx0KSk7IH07XG4gICAgICAgICAgICBnZXRSZXF1ZXN0Lm9uZXJyb3IgPSAoZXJyb3IpID0+IHsgcmVqZWN0KGVycm9yKTsgfTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGtleSBcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICAgKi9cbiAgICBkZWxldGVFbnRpdHkoa2V5LCBzdG9yZU5hbWUpIHtcbiAgICAgICAgY29uc3QgdHJhbnNhY3Rpb24gPSB0aGlzLnRyYW5zYWN0aW9uKFwicmVhZHdyaXRlXCIsIHN0b3JlTmFtZSk7XG4gICAgICAgIGNvbnN0IHN0b3JlID0gdHJhbnNhY3Rpb24ub2JqZWN0U3RvcmUoc3RvcmVOYW1lKTtcbiAgICAgICAgY29uc3QgZGVsZXRlUmVxdWVzdCA9IHN0b3JlLmRlbGV0ZShrZXkpO1xuICAgICAgICBjb25zdCBjb250ZXh0ID0gdGhpcztcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZVJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4geyAgY29udGV4dC5ub3RpZnlEZWxldGUoa2V5LCBzdG9yZU5hbWUpOyByZXNvbHZlKGRlbGV0ZVJlcXVlc3QucmVzdWx0KTsgfTtcbiAgICAgICAgICAgIGRlbGV0ZVJlcXVlc3Qub25lcnJvciA9IChlcnJvcikgPT4ge3JlamVjdChlcnJvcik7IH07XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG5vdGlmeURlbGV0ZShrZXksIHN0b3JlTmFtZSkge1xuICAgICAgICBpZiAodGhpcy5zdWJzY3JpcHRpb25NYW5hZ2VyTWFwLmNvbnRhaW5zKHN0b3JlTmFtZSkpIHtcbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uTWFuYWdlck1hcC5nZXQoc3RvcmVOYW1lKS5ub3RpZnlEZWxldGUoa2V5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG5vdGlmeVB1dChlbnRpdHksIHN0b3JlTmFtZSkge1xuICAgICAgICBpZiAodGhpcy5zdWJzY3JpcHRpb25NYW5hZ2VyTWFwLmNvbnRhaW5zKHN0b3JlTmFtZSkpIHtcbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uTWFuYWdlck1hcC5nZXQoc3RvcmVOYW1lKS5ub3RpZnlQdXQoZW50aXR5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN1YnNjcmliZXJzIGFyZSB3ZWFrbHkgcmVmZXJlbmNlZC4gS2VlcCBhIHJlZmVyZW5jZSB0byB0aGUgXG4gICAgICogaW5zdGFuY2Ugb2YgdGhlIE9iamVjdEZ1bmN0aW9uIHRvIGVuc3VyZSBpdCBpcyBub3QgYXV0b21hdGljYWxseVxuICAgICAqIHJlbW92ZWQuXG4gICAgICogXG4gICAgICogQHR5cGUge1N0cmluZ30gc3RvcmVOYW1lXG4gICAgICogQHR5cGUge09iamVjdEZ1bmN0aW9ufSBvYmplY3RGdW5jdGlvblxuICAgICAqL1xuICAgIHN1YnNjcmliZVB1dChzdG9yZU5hbWUsIG9iamVjdEZ1bmN0aW9uKSB7XG4gICAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25NYW5hZ2VyTWFwLmNvbnRhaW5zKHN0b3JlTmFtZSkpIHtcbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uTWFuYWdlck1hcC5zZXQoc3RvcmVOYW1lLCBuZXcgU3Vic2NyaXB0aW9uTWFuYWdlcigpKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbk1hbmFnZXJNYXAuZ2V0KHN0b3JlTmFtZSkuc3Vic2NyaWJlKG9iamVjdEZ1bmN0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdWJzY3JpYmVycyBhcmUgd2Vha2x5IHJlZmVyZW5jZWQuIEtlZXAgYSByZWZlcmVuY2UgdG8gdGhlIFxuICAgICAqIGluc3RhbmNlIG9mIHRoZSBPYmplY3RGdW5jdGlvbiB0byBlbnN1cmUgaXQgaXMgbm90IGF1dG9tYXRpY2FsbHlcbiAgICAgKiByZW1vdmVkLlxuICAgICAqIFxuICAgICAqIEB0eXBlIHtTdHJpbmd9IHN0b3JlTmFtZVxuICAgICAqIEB0eXBlIHtPYmplY3RGdW5jdGlvbn0gcHV0T2JqZWN0RnVuY3Rpb25cbiAgICAgKiBAdHlwZSB7T2JqZWN0RnVuY3Rpb259IGRlbGV0ZU9iamVjdEZ1bmN0aW9uXG4gICAgICovXG4gICAgc3Vic2NyaWJlKHB1dE9iamVjdEZ1bmN0aW9uLCBkZWxldGVPYmplY3RGdW5jdGlvbiwgc3RvcmVOYW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25NYW5hZ2VyTWFwLmNvbnRhaW5zKHN0b3JlTmFtZSkpIHtcbiAgICAgICAgICAgIHRoaXMuc3Vic2NyaXB0aW9uTWFuYWdlck1hcC5zZXQoc3RvcmVOYW1lLCBuZXcgU3Vic2NyaXB0aW9uTWFuYWdlcigpKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbk1hbmFnZXJNYXAuZ2V0KHN0b3JlTmFtZSkuc3Vic2NyaWJlKHB1dE9iamVjdEZ1bmN0aW9uLCBkZWxldGVPYmplY3RGdW5jdGlvbik7XG4gICAgfVxuXG59Il0sIm5hbWVzIjpbIkxPRyIsIkxvZ2dlciIsIkxpc3QiLCJPYmplY3RGdW5jdGlvbiIsIk1hcCIsIkNvbnRhaW5lckRhdGFiYXNlU3RvcmFnZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBLE1BQU1BLEtBQUcsR0FBRyxJQUFJQyxrQkFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQ3RDO0FBQ08sTUFBTSxZQUFZLENBQUM7QUFDMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLElBQUksV0FBVyxDQUFDLFdBQVcsRUFBRTtBQUM3QixRQUFRLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO0FBQ3ZDLEtBQUs7QUFD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
