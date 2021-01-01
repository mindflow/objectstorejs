export class IndexConfig {

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