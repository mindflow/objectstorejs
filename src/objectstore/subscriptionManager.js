import { List, ObjectFunction } from "coreutil_v1";

export class SubscriptionManager {

    constructor() {
        this.putSubscribers = new List();
        this.deleteSubscribers = new List();
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
        if (putSubscriber instanceof ObjectFunction) {
            this.putSubscribers.add(new WeakRef(putSubscriber));
        }
        if (deleteSubscriber instanceof ObjectFunction) {
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
        new List(toRemoveArray).forEach((toRemove, parent) => {
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
        new List(toRemoveArray).forEach((toRemove, parent) => {
            this.deleteSubscribers.remove(toRemove);
        });
    }

}