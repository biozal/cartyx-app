import org.janusgraph.core.Cardinality
import org.janusgraph.core.Multiplicity
import org.janusgraph.core.schema.ConsistencyModifier
import org.janusgraph.core.schema.SchemaStatus
import org.apache.tinkerpop.gremlin.structure.Vertex

// Deliberately limited to today's one-server topology. A JVM monitor serializes
// these complete migration requests; it is NOT a distributed schema lease.
synchronized (graph) {
    graph.tx().rollback()
    def m = graph.openManagement()
    def hasRecordIndex = false
    try {
        def existing = m.getGraphIndex('byCartyxSchema')
        if (existing != null) {
            if (!existing.isCompositeIndex() || !existing.isUnique() ||
                existing.getFieldKeys().collect { it.name() } != ['graphSchemaName'] ||
                !existing.getFieldKeys().every { existing.getIndexStatus(it) == SchemaStatus.ENABLED })
                throw new IllegalStateException('Schema record index drift or not ENABLED')
            hasRecordIndex = true
        }
    } finally { m.rollback() }
    // Reject newer/modified migrations BEFORE any schema changes can commit.
    if (hasRecordIndex) {
        try {
            def previous = g.V().has('graphSchemaName', 'cartyx').limit(2).toList()
            if (previous.size() > 1) throw new IllegalStateException('Duplicate schema record')
            if (previous.size() == 1 && (previous[0].label() != 'GraphSchema' ||
                previous[0].value('graphSchemaVersion') != '0001' ||
                previous[0].value('graphSchemaChecksum') != checksum))
                throw new IllegalStateException('Schema version/checksum mismatch; do not downgrade or edit applied migrations')
        } finally { graph.tx().rollback() }
    }
    m = graph.openManagement()
    try {
        if (m.getOpenInstances().size() != 1) throw new IllegalStateException('Requires exactly one graph instance')
        def definitions = [entityId: String.class, kind: String.class, scope: String.class,
            graphSchemaName: String.class, graphSchemaVersion: String.class,
            graphSchemaChecksum: String.class, graphProbeValue: String.class]
        def created = [] as Set
        definitions.each { name, type ->
            def key = m.getPropertyKey(name)
            if (key == null) {
                if (!applySchema) throw new IllegalStateException('Missing property: ' + name)
                key = m.makePropertyKey(name).dataType(type).cardinality(Cardinality.SINGLE).make()
                created.add(name)
            }
            if (key.dataType() != type || key.cardinality() != Cardinality.SINGLE)
                throw new IllegalStateException('Property drift: ' + name)
        }
        ['GraphSchema', 'GraphFoundationProbe'].each { name ->
            def label = m.getVertexLabel(name)
            if (label == null) {
                if (!applySchema) throw new IllegalStateException('Missing label: ' + name)
                label = m.makeVertexLabel(name).make()
            }
            if (label.isPartitioned() || label.isStatic()) throw new IllegalStateException('Label drift: ' + name)
        }
        def edge = m.getEdgeLabel('GRAPH_FOUNDATION_LINK')
        if (edge == null) {
            if (!applySchema) throw new IllegalStateException('Missing probe edge')
            edge = m.makeEdgeLabel('GRAPH_FOUNDATION_LINK').multiplicity(Multiplicity.SIMPLE).make()
        }
        if (edge.multiplicity() != Multiplicity.SIMPLE || !edge.isDirected())
            throw new IllegalStateException('Probe edge drift')
        [byCartyxIdentity: ['scope', 'kind', 'entityId'], byCartyxSchema: ['graphSchemaName']].each { name, keys ->
            def index = m.getGraphIndex(name)
            if (index == null) {
                if (!applySchema) throw new IllegalStateException('Missing index: ' + name)
                // Never enable an empty index over pre-existing keys and silently hide data.
                if (!keys.every { created.contains(it) })
                    throw new IllegalStateException('Existing keys require an explicit reindex migration: ' + name)
                def builder = m.buildIndex(name, Vertex.class)
                keys.each { builder.addKey(m.getPropertyKey(it)) }
                index = builder.unique().buildCompositeIndex()
                m.setConsistency(index, ConsistencyModifier.LOCK)
            }
            if (!index.isCompositeIndex() || !index.isUnique() || !Vertex.class.isAssignableFrom(index.getIndexedElement()) ||
                index.getSchemaTypeConstraint() != null ||
                index.getFieldKeys().collect { it.name() }.sort() != keys.sort() ||
                m.getConsistency(index) != ConsistencyModifier.LOCK)
                throw new IllegalStateException('Index drift: ' + name)
        }
        if (applySchema) m.commit() else m.rollback()
    } catch (Exception e) { m.rollback(); throw e }

    // New keys and indexes are created together, so no existing values need
    // reindexing. Still verify ENABLED before issuing indexed reads or recording completion.
    m = graph.openManagement()
    try {
        ['byCartyxIdentity', 'byCartyxSchema'].each { name ->
            def index = m.getGraphIndex(name)
            if (!index.getFieldKeys().every { index.getIndexStatus(it) == SchemaStatus.ENABLED })
                throw new IllegalStateException('Index not ENABLED; inspect lifecycle before retry: ' + name)
        }
    } finally { m.rollback() }
    try {
        def records = g.V().has('graphSchemaName', 'cartyx').limit(2).toList()
        if (records.size() > 1) throw new IllegalStateException('Duplicate schema record')
        if (records.size() == 1) {
            def record = records[0]
            if (record.label() != 'GraphSchema' || record.value('graphSchemaVersion') != '0001' ||
                record.value('graphSchemaChecksum') != checksum)
                throw new IllegalStateException('Schema version/checksum mismatch; do not downgrade or edit applied migrations')
        } else {
            if (!applySchema) throw new IllegalStateException('Schema completion record missing')
            g.addV('GraphSchema').property('graphSchemaName', 'cartyx')
                .property('graphSchemaVersion', '0001').property('graphSchemaChecksum', checksum).iterate()
        }
        if (applySchema) graph.tx().commit() else graph.tx().rollback()
        return '0001:verified'
    } catch (Exception e) { graph.tx().rollback(); throw e }
}
