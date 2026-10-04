(() => {
  'use strict';
  const VERSION = 6;
  const storeNames = ['meta','races','deliveries','deliveryEvents','locations','proofs','earnings','outbox','inbox','tombstones','syncState'];
  const migrations = {
    1: ({db}) => {
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
      if (!db.objectStoreNames.contains('races')) {
        const races=db.createObjectStore('races',{keyPath:'id'});
        races.createIndex('status','status',{unique:false});races.createIndex('createdAt','createdAt',{unique:false});
      }
      for (const name of storeNames.slice(2)) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name,{keyPath:'id'});
    },
    2: () => {}, // Versão histórica, preservada para upgrades de bancos existentes.
    3: () => {},
    4: () => {},
    5: () => {},
    6: ({transaction}) => {
      const indexSpecs={
        races:[['status','status'],['createdAt','createdAt'],['byCompanyId','companyId'],['byDeliveryId','deliveryId'],['byUpdatedAt','updatedAt'],['bySyncState','sync.state']],
        deliveries:[['byCompanyId','companyId'],['byUpdatedAt','updatedAt'],['byCanonicalId','sync.canonicalId']],
        deliveryEvents:[['byDeliveryId','deliveryId'],['byEventId','eventId'],['byCreatedAt','createdAt']],
        locations:[['byDeliveryId','deliveryId'],['byCreatedAt','createdAt']], proofs:[['byDeliveryId','deliveryId'],['byCreatedAt','createdAt']],
        earnings:[['byDeliveryId','deliveryId'],['byCreatedAt','createdAt']], outbox:[['bySyncState','status'],['byCreatedAt','createdAt']],
        inbox:[['byCreatedAt','receivedAt']], tombstones:[['byStore','store'],['byUpdatedAt','updatedAt']], syncState:[['byUpdatedAt','updatedAt']]
      };
      for (const [name,indexes] of Object.entries(indexSpecs)) {
        const store=transaction.objectStore(name);
        for (const [indexName,keyPath] of indexes) if (!store.indexNames.contains(indexName)) store.createIndex(indexName,keyPath,{unique:false});
      }
    }
  };
  function upgrade(db,transaction,oldVersion,newVersion){
    if(!Number.isInteger(oldVersion)||!Number.isInteger(newVersion)||oldVersion<0||newVersion!==VERSION||oldVersion>=newVersion)
      throw new Error('Versão de migration IndexedDB inválida.');
    for(const name of storeNames)if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:name==='meta'?'key':'id'});
    for(let version=oldVersion+1;version<=newVersion;version++){
      const migrate=migrations[version];
      if(typeof migrate!=='function')throw new Error(`Migration IndexedDB ${version} não encontrada.`);
      migrate({db,transaction});
    }
    transaction.objectStore('meta').put({key:'storageSchemaVersion',value:newVersion});
  }
  window.RotaMotoStorageSchema=Object.freeze({version:VERSION,stores:Object.freeze(storeNames),upgrade});
})();
