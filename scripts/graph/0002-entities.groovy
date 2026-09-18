import org.janusgraph.core.Cardinality
import org.janusgraph.core.Multiplicity
import org.janusgraph.core.schema.ConsistencyModifier
import org.janusgraph.core.schema.SchemaAction
import org.janusgraph.core.schema.SchemaStatus
import org.janusgraph.graphdb.database.management.ManagementSystem
import org.apache.tinkerpop.gremlin.structure.Vertex

// Additive component schema for generic domain entities. The foundation identity
// tuple (scope, kind, entityId) and its unique composite index stay untouched.
synchronized (graph) {
    graph.tx().rollback()
    def records = g.V().has('graphSchemaName', 'cartyx_entities').limit(2).toList()
    def installed = !records.isEmpty()
    def storedVersion = null
    try {
        if (records.size() > 1) throw new IllegalStateException('Duplicate entity schema record')
        if (installed) {
            if (records[0].label() != 'GraphSchema') throw new IllegalStateException('Entity schema record drift')
            storedVersion = records[0].value('graphSchemaVersion')
            // Same version must be byte-identical; a newer stored version is never downgraded.
            if (storedVersion == version && records[0].value('graphSchemaChecksum') != checksum)
                throw new IllegalStateException('Entity schema checksum mismatch; do not edit an applied migration')
            if (storedVersion > version) throw new IllegalStateException('Stored entity schema is newer than this code')
        }
    } finally { graph.tx().rollback() }
    // An older applied version is upgraded additively by the definitions below.
    def upgrading = installed && storedVersion != version

    def stringKeys = ['doc']
    def longKeys = ['revision']
    def integerKeys = ['docVersion', 'position']
    def dateKeys = ['createdAt', 'updatedAt']
    def slots = [:]
    (1..8).each { slots["ix_s$it".toString()] = String.class }
    (1..4).each { slots["ix_n$it".toString()] = Long.class }
    (1..4).each { slots["ix_b$it".toString()] = Boolean.class }
    (1..2).each { slots["ix_d$it".toString()] = Date.class }

    def m = graph.openManagement()
    try {
        if (m.getOpenInstances().size() != 1) throw new IllegalStateException('Requires one graph instance')
        def define = { name, type ->
            def key = m.getPropertyKey(name)
            if (key == null) {
                if (!applySchema || (installed && !upgrading)) throw new IllegalStateException('Missing entity property ' + name)
                key = m.makePropertyKey(name).dataType(type).cardinality(Cardinality.SINGLE).make()
                // A revisioned compare-and-set needs JanusGraph to lock the key it tests.
                if (name == 'revision') m.setConsistency(key, ConsistencyModifier.LOCK)
            }
            if (key.dataType() != type || key.cardinality() != Cardinality.SINGLE)
                throw new IllegalStateException('Entity property drift: ' + name)
            if (name == 'revision' && m.getConsistency(key) != ConsistencyModifier.LOCK)
                throw new IllegalStateException('Revision key must be lock-consistent')
            key
        }
        stringKeys.each { define(it, String.class) }
        // Search words are multi-valued: one indexed token per word, which gives
        // Mongo `$text` word semantics without a mixed index.
        def searchWord = m.getPropertyKey('searchWord')
        if (searchWord == null) {
            if (!applySchema || (installed && !upgrading)) throw new IllegalStateException('Missing searchWord property')
            searchWord = m.makePropertyKey('searchWord').dataType(String.class).cardinality(Cardinality.SET).make()
        }
        if (searchWord.dataType() != String.class || searchWord.cardinality() != Cardinality.SET)
            throw new IllegalStateException('searchWord property drift')
        longKeys.each { define(it, Long.class) }
        integerKeys.each { define(it, Integer.class) }
        dateKeys.each { define(it, Date.class) }
        slots.each { name, type -> define(name, type) }

        // One composite index per slot, always together with scope and kind so that a
        // filtered list is an indexed lookup rather than a scan.
        def scopeKey = m.getPropertyKey('scope')
        def kindKey = m.getPropertyKey('kind')
        if (scopeKey == null || kindKey == null) throw new IllegalStateException('Foundation identity keys missing')
        // A composite index needs every one of its keys, so listing a kind without any
        // filter needs its own (scope, kind) index; the slot indexes serve filtered lists.
        def base = m.getGraphIndex('byScopeKind')
        if (base == null) {
            if (!applySchema || (installed && !upgrading)) throw new IllegalStateException('Missing byScopeKind index')
            m.buildIndex('byScopeKind', Vertex.class).addKey(scopeKey).addKey(kindKey).buildCompositeIndex()
        } else if (base.isUnique() ||
            base.getFieldKeys().collect { it.name() }.toSet() != ['scope', 'kind'].toSet()) {
            throw new IllegalStateException('Entity index drift: byScopeKind')
        }
        slots.keySet().each { name ->
            def indexName = 'byScopeKind_' + name
            def index = m.getGraphIndex(indexName)
            if (index == null) {
                if (!applySchema || (installed && !upgrading)) throw new IllegalStateException('Missing entity index ' + indexName)
                m.buildIndex(indexName, Vertex.class).addKey(scopeKey).addKey(kindKey)
                    .addKey(m.getPropertyKey(name)).buildCompositeIndex()
            } else if (index.isUnique() ||
                index.getFieldKeys().collect { it.name() }.toSet() != ['scope', 'kind', name].toSet()) {
                // Field order is JanusGraph's business; the key set is what must match.
                throw new IllegalStateException('Entity index drift: ' + indexName)
            }
        }
        // Composite index over the multi-valued word property, scoped like the others.
        def search = m.getGraphIndex('byEntityText')
        if (search == null) {
            if (!applySchema || (installed && !upgrading)) throw new IllegalStateException('Missing entity text index')
            m.buildIndex('byEntityText', Vertex.class).addKey(scopeKey).addKey(kindKey)
                .addKey(m.getPropertyKey('searchWord')).buildCompositeIndex()
        } else if (search.isUnique() ||
            search.getFieldKeys().collect { it.name() }.toSet() != ['scope', 'kind', 'searchWord'].toSet()) {
            throw new IllegalStateException('Entity text index drift')
        }
        if (applySchema) m.commit() else m.rollback()
    } catch (Exception e) { m.rollback(); throw e }

    if (applySchema) {
        // Wait for every new index to become available before any query may rely on it.
        slots.keySet().collect { 'byScopeKind_' + it } .plus(['byEntityText', 'byScopeKind']).each { name ->
            ManagementSystem.awaitGraphIndexStatus(graph, name).status(SchemaStatus.ENABLED, SchemaStatus.REGISTERED).call()
        }
        def enable = graph.openManagement()
        try {
            slots.keySet().collect { 'byScopeKind_' + it } .plus(['byEntityText', 'byScopeKind']).each { name ->
                def index = enable.getGraphIndex(name)
                if (index.getFieldKeys().any { index.getIndexStatus(it) == SchemaStatus.REGISTERED })
                    enable.updateIndex(index, SchemaAction.ENABLE_INDEX)
            }
            enable.commit()
        } catch (Exception e) { enable.rollback(); throw e }
        slots.keySet().collect { 'byScopeKind_' + it } .plus(['byEntityText', 'byScopeKind']).each { name ->
            ManagementSystem.awaitGraphIndexStatus(graph, name).status(SchemaStatus.ENABLED).call()
        }
    }

    // Adding an index to a graph that already holds data does not make the older
    // entities findable: that needs `npm run graph:reindex`, which starts the scan and
    // polls it, because a reindex outruns a single bounded request.

    // Vertices carry their kind as an indexed property, so one declared label is enough;
    // a new domain kind needs no schema change. Relationships stay explicit.
    def labels = graph.openManagement()
    try {
        if (labels.getVertexLabel('Entity') == null) {
            if (!applySchema) throw new IllegalStateException('Missing Entity vertex label')
            labels.makeVertexLabel('Entity').make()
        }
        ['WITHIN', 'LOCATED_IN', 'IN_CAMPAIGN', 'MEMBER_OF', 'ASSOCIATED_WITH', 'GIVEN_BY',
         'INVOLVES', 'SUBQUEST_OF', 'LINKS_TO', 'TAGGED_WITH', 'REPRESENTS'].each { name ->
            def edge = labels.getEdgeLabel(name)
            if (edge == null) {
                if (!applySchema) throw new IllegalStateException('Missing edge label ' + name)
                edge = labels.makeEdgeLabel(name).multiplicity(Multiplicity.MULTI).make()
            }
            if (!edge.isDirected()) throw new IllegalStateException('Edge label drift: ' + name)
        }
        if (applySchema) labels.commit() else labels.rollback()
    } catch (Exception e) { labels.rollback(); throw e }

    def verify = graph.openManagement()
    try {
        slots.keySet().collect { 'byScopeKind_' + it } .plus(['byEntityText', 'byScopeKind']).each { name ->
            def index = verify.getGraphIndex(name)
            if (index == null) throw new IllegalStateException('Missing entity index ' + name)
            if (!index.getFieldKeys().every { index.getIndexStatus(it) == SchemaStatus.ENABLED })
                throw new IllegalStateException('Entity index not ENABLED: ' + name)
        }
    } finally { verify.rollback() }

    try {
        if (!installed || upgrading) {
            if (!applySchema) throw new IllegalStateException('Entity completion record missing or outdated')
            if (upgrading) g.V().has('graphSchemaName', 'cartyx_entities').drop().iterate()
            g.addV('GraphSchema').property('graphSchemaName', 'cartyx_entities')
                .property('graphSchemaVersion', version).property('graphSchemaChecksum', checksum).iterate()
            graph.tx().commit()
        } else graph.tx().rollback()
        return 'entities:' + version + ':verified'
    } catch (Exception e) { graph.tx().rollback(); throw e }
}
