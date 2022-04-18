import { List, Method } from "coreutil_v1";

export class SubscriptionManager {

    constructor() {
        this.putSubscribers = new List();
        this.deleteSubscribers = new List();
    }

    /**
     * Subscribers are weakly referenced. Keep a reference to the 
     * instance of the Method to ensure it is not automatically
     * removed.
     * 
     * @param {Method} putSubscriber 
     */
    subscribePut(putSubscriber) {
        if (putSubscriber instanceof Method) {
            this.putSubscribers.add(new WeakRef(putSubscriber));
        }
    }

    /**
     * Subscribers are weakly referenced. Keep a reference to the 
     * instance of the Method to ensure it is not automatically
     * removed.
     * 
     * @param {Method} deleteSubscriber 
     */
     subscribeDelete(deleteSubscriber) {
        if (deleteSubscriber instanceof Method) {
            this.deleteSubscribers.add(new WeakRef(deleteSubscriber));
        }
    }

    notifyPut(entity) {
        let toRemoveArray = [];
        this.putSubscribers.forEach((weakRefSubscriber, parent) => {
            /** @type {Method} */
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
            /** @type {Method} */
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