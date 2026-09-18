import org.janusgraph.core.Cardinality
import org.janusgraph.core.Multiplicity
import org.janusgraph.core.schema.ConsistencyModifier
import org.janusgraph.core.schema.SchemaAction
import org.janusgraph.core.schema.SchemaStatus
import org.janusgraph.graphdb.database.management.ManagementSystem
import org.apache.tinkerpop.gremlin.structure.Vertex

// Additive component schema for generic domain entities. The foundation identity tuple
// (scope, kind, entityId) and its unique composite index stay untouched.
//
// Creating every index in one request outruns the server's evaluation timeout on an
// empty graph, so the caller drives one bounded `step` per request. Each step creates
// only what is missing, so retrying after an interruption is safe, and the completion
// record is written last.
synchronized (graph) {
    def slots = [:]
    (1..8).each { slots["ix_s$it".toString()] = String.class }
    (1..4).each { slots["ix_n$it".toString()] = Long.class }
    (1..4).each { slots["ix_b$it".toString()] = Boolean.class }
    (1..2).each { slots["ix_d$it".toString()] = Date.class }
    // A composite index needs every one of its keys, so listing a kind without a filter
    // needs its own (scope, kind) index; the slot indexes serve filtered lists.
    def indexKeys = ['byScopeKind': null, 'byEntityText': 'searchWord']
    slots.keySet().each { indexKeys['byScopeKind_' + it] = it }
    def edgeLabels = ['WITHIN', 'LOCATED_IN', 'IN_CAMPAIGN', 'MEMBER_OF', 'ASSOCIATED_WITH',
                      'GIVEN_BY', 'INVOLVES', 'SUBQUEST_OF', 'LINKS_TO', 'TAGGED_WITH', 'REPRESENTS']

    graph.tx().rollback()
    def records = g.V().has('graphSchemaName', 'cartyx_entities').limit(2).toList()
    def installed = !records.isEmpty()
    def storedVersion = null
    try {
        if (records.size() > 1) throw new IllegalStateException('Duplicate entity schema record')
        if (installed) {
            if (records[0].label() != 'GraphSchema') throw new IllegalStateException('Entity schema record drift')
            storedVersion = records[0].value('graphSchemaVersion')
            // The same version must be byte-identical; a newer stored version is never downgraded.
            if (storedVersion == version && records[0].value('graphSchemaChecksum') != checksum)
                throw new IllegalStateException('Entity schema checksum mismatch; do not edit an applied migration')
            if (storedVersion > version) throw new IllegalStateException('Stored entity schema is newer than this code')
        }
    } finally { graph.tx().rollback() }
    def complete = installed && storedVersion == version
    // Anything missing may be created while the recorded version is absent or older.
    def mayCreate = applySchema && !complete

    if (step == 'properties') {
        def m = graph.openManagement()
        try {
            if (m.getOpenInstances().size() != 1) throw new IllegalStateException('Requires one graph instance')
            def define = { name, type, cardinality ->
                def key = m.getPropertyKey(name)
                if (key == null) {
                    if (!mayCreate) throw new IllegalStateException('Missing entity property ' + name)
                    key = m.makePropertyKey(name).dataType(type).cardinality(cardinality).make()
                    // A revisioned compare-and-set needs JanusGraph to lock the key it tests.
                    if (name == 'revision') m.setConsistency(key, ConsistencyModifier.LOCK)
                }
                if (key.dataType() != type || key.cardinality() != cardinality)
                    throw new IllegalStateException('Entity property drift: ' + name)
                if (name == 'revision' && m.getConsistency(key) != ConsistencyModifier.LOCK)
                    throw new IllegalStateException('Revision key must be lock-consistent')
            }
            define('doc', String.class, Cardinality.SINGLE)
            define('docVersion', Integer.class, Cardinality.SINGLE)
            define('position', Integer.class, Cardinality.SINGLE)
            define('revision', Long.class, Cardinality.SINGLE)
            define('createdAt', Date.class, Cardinality.SINGLE)
            define('updatedAt', Date.class, Cardinality.SINGLE)
            // Search words are multi-valued: one indexed token per word, which gives Mongo
            // `$text` word semantics without a mixed index.
            define('searchWord', String.class, Cardinality.SET)
            slots.each { name, type -> define(name, type, Cardinality.SINGLE) }
            if (applySchema) m.commit() else m.rollback()
        } catch (Exception e) { m.rollback(); throw e }
        return 'entities:properties'
    }

    if (step == 'labels') {
        def m = graph.openManagement()
        try {
            // Vertices carry their kind as an indexed property, so one declared label is
            // enough and a new domain kind needs no schema change.
            if (m.getVertexLabel('Entity') == null) {
                if (!mayCreate) throw new IllegalStateException('Missing Entity vertex label')
                m.makeVertexLabel('Entity').make()
            }
            edgeLabels.each { name ->
                def edge = m.getEdgeLabel(name)
                if (edge == null) {
                    if (!mayCreate) throw new IllegalStateException('Missing edge label ' + name)
                    edge = m.makeEdgeLabel(name).multiplicity(Multiplicity.MULTI).make()
                }
                if (!edge.isDirected()) throw new IllegalStateException('Edge label drift: ' + name)
            }
            if (applySchema) m.commit() else m.rollback()
        } catch (Exception e) { m.rollback(); throw e }
        return 'entities:labels'
    }

    if (step == 'index') {
        if (!indexKeys.containsKey(indexName)) throw new IllegalStateException('Unknown index ' + indexName)
        def extra = indexKeys[indexName]
        def expected = extra == null ? ['scope', 'kind'] : ['scope', 'kind', extra]
        def m = graph.openManagement()
        try {
            def index = m.getGraphIndex(indexName)
            if (index == null) {
                if (!mayCreate) throw new IllegalStateException('Missing entity index ' + indexName)
                def builder = m.buildIndex(indexName, Vertex.class)
                    .addKey(m.getPropertyKey('scope')).addKey(m.getPropertyKey('kind'))
                if (extra != null) builder = builder.addKey(m.getPropertyKey(extra))
                builder.buildCompositeIndex()
            } else if (index.isUnique() ||
                index.getFieldKeys().collect { it.name() }.toSet() != expected.toSet()) {
                // Field order is JanusGraph's business; the key set is what must match.
                throw new IllegalStateException('Entity index drift: ' + indexName)
            }
            if (applySchema) m.commit() else m.rollback()
        } catch (Exception e) { m.rollback(); throw e }

        if (applySchema) {
            ManagementSystem.awaitGraphIndexStatus(graph, indexName)
                .status(SchemaStatus.ENABLED, SchemaStatus.REGISTERED).call()
            def enable = graph.openManagement()
            try {
                def index = enable.getGraphIndex(indexName)
                if (index.getFieldKeys().any { index.getIndexStatus(it) == SchemaStatus.REGISTERED })
                    enable.updateIndex(index, SchemaAction.ENABLE_INDEX)
                enable.commit()
            } catch (Exception e) { enable.rollback(); throw e }
            ManagementSystem.awaitGraphIndexStatus(graph, indexName).status(SchemaStatus.ENABLED).call()
        }

        def verify = graph.openManagement()
        try {
            def index = verify.getGraphIndex(indexName)
            if (index == null) throw new IllegalStateException('Missing entity index ' + indexName)
            if (!index.getFieldKeys().every { index.getIndexStatus(it) == SchemaStatus.ENABLED })
                throw new IllegalStateException('Entity index not ENABLED: ' + indexName)
        } finally { verify.rollback() }
        return 'entities:index:' + indexName
    }

    if (step == 'record') {
        // Everything the earlier steps create must exist before the version is recorded.
        // Adding an index to a graph that already holds data does not make older entities
        // findable: that needs `npm run graph:reindex`, which starts the scan and polls it.
        def m = graph.openManagement()
        try {
            (['doc', 'docVersion', 'position', 'revision', 'createdAt', 'updatedAt', 'searchWord']
                + (slots.keySet() as List)).each { name ->
                    def key = m.getPropertyKey(name)
                    if (key == null) throw new IllegalStateException('Missing entity property ' + name)
                    if (!m.getTTL(key).isZero()) throw new IllegalStateException('Entity schema TTL drift')
                }
            if (m.getVertexLabel('Entity') == null) throw new IllegalStateException('Missing Entity vertex label')
            edgeLabels.each { if (m.getEdgeLabel(it) == null) throw new IllegalStateException('Missing edge label ' + it) }
            indexKeys.keySet().each { name ->
                def index = m.getGraphIndex(name)
                if (index == null) throw new IllegalStateException('Missing entity index ' + name)
                if (!index.getFieldKeys().every { index.getIndexStatus(it) == SchemaStatus.ENABLED })
                    throw new IllegalStateException('Entity index not ENABLED: ' + name)
            }
        } finally { m.rollback() }

        try {
            if (!complete) {
                if (!applySchema) throw new IllegalStateException('Entity completion record missing or outdated')
                if (installed) g.V().has('graphSchemaName', 'cartyx_entities').drop().iterate()
                g.addV('GraphSchema').property('graphSchemaName', 'cartyx_entities')
                    .property('graphSchemaVersion', version).property('graphSchemaChecksum', checksum).iterate()
                graph.tx().commit()
            } else graph.tx().rollback()
        } catch (Exception e) { graph.tx().rollback(); throw e }
        return 'entities:' + version + ':verified'
    }

    throw new IllegalStateException('Unknown entity schema step')
}
