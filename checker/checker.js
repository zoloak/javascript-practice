class Check {
    constructor(check) {
        this.infos = check; // save this raw check parameter anyway
        this.name = check.name;
        this.type = check.type;
        if (check.async) {
            this.async = true;
            this._check = check.check;
        } else {
            this.async = false;
            this._check = function(checkable) {
                if (check.check(checkable)) {
                    return Promise.resolve();
                } else {
                    console.log('checking: ' + this.name + ' failed');
                    return Promise.reject();
                }
            };
        }
    }
    check(checkable) { // just in order to print log, may delete in future
        console.log('checking: ' + this.name);
        return this._check(checkable);
    }
}

class Checkable {
    rules = new Map();
    constructor(data) {
        this.data = data;
        this.addStatus(true, 'inAllCondition');
    }
    addStatus(check, name) {
        this.rules.set(name, []);
        if (check instanceof Check) {
            Object.defineProperty( this, name, { get : function() {return check.check(this);} } );
        } else if (typeof check == 'function') {
            Object.defineProperty( this, name, { get : function() {return check(this);} } );
        } else if (typeof check == 'boolean') {
            Object.defineProperty( this, name, { get : function() {return check;} } );
        }
    }
    #addCheck(check, name) {
        this.rules.get(name).push(check);
    }
    addCheck(check) {
        this.#addCheck(check, check.name);
    }
    addChecks(checks) {
        // in the older version, this function adds status and check at same time,
        // but now a Check object returns a Promise, so status added here won't work.
        // I'll keep it for now.
        for (const check of checks) {
            if (check.type == 'status') {
                this.addStatus(check, check.name);
            }
        }
        for (const check of checks) {
            if (check.type == 'check') {
                if (Array.isArray(check.infos.doCheckOn)) {
                    for (const condition of check.infos.doCheckOn) {
                        this.#addCheck(check, condition);
                    }
                } else if (typeof check.infos.doCheckOn == 'string') {
                    this.#addCheck(check, check.infos.doCheckOn);
                } else {
                    this.#addCheck(check, 'inAllCondition');
                }
            }
        }
    }
    docheck(status) {
        if (!status) {
            status = [];
            this.rules.forEach((_v, k) => status.push(k));
        } else if (!Array.isArray(status)) {
            status = [status];
        }
        let promises = [];
        let checkedStatus = status.filter(s => this[s]);
        for (const cs of checkedStatus) {
            for (const check of this.rules.get(cs)) {
                promises.push(check.check(this));
            }
        }
        return Promise.all(promises);
    }
}

// Here's a example:

let someobject = new Checkable({sex: 1, age: 18, height: 160});
someobject.addStatus( c => (c.data.sex == 1), 'isMale' );
someobject.addStatus( c => (c.data.sex == 2), 'isFemale' );
someobject.addChecks([
    new Check( { check: c => (c.data.age >= 18), type: 'check', name: 'adult check 1', doCheckOn: ['isMale']} ),
    new Check( { check: c => (c.data.age >= 18), type: 'check', name: 'adult check 2', doCheckOn: 'isMale'} ),
    new Check( { check: c => new Promise((resolve, reject) => { setTimeout(()=>{if (c.data.height == 160) {resolve();} else {reject();}}, 2000) }), type: 'check', name: 'adult check 3', async: true} ),
]);
someobject.docheck()
.then(() => {console.log('SUCCESS')})
.catch(() => {console.log('FAIL')});
