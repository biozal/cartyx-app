import org.janusgraph.core.Cardinality
import org.janusgraph.core.Multiplicity
import org.janusgraph.core.schema.ConsistencyModifier

// Additive component schema: foundation's immutable 0001 marker is untouched.
synchronized (graph) {
    graph.tx().rollback()
    def records = g.V().has('graphSchemaName', 'cartyx_identity_profiles').limit(2).toList()
    def installed = !records.isEmpty()
    try {
        if (records.size() > 1 || (installed && (records[0].label() != 'GraphSchema' ||
            records[0].value('graphSchemaVersion') != '0001' || records[0].value('graphSchemaChecksum') != checksum)))
            throw new IllegalStateException('Profile schema version/checksum mismatch')
    } finally { graph.tx().rollback() }
    def m = graph.openManagement()
    try {
        if (m.getOpenInstances().size() != 1) throw new IllegalStateException('Requires one graph instance')
        ['identityProfileDigest', 'identityProfileFirstName', 'identityProfileLastName',
         'identityProfileAvatarUrl', 'identityProfileRole', 'identityProfileRulerColor',
         'identityProfileCreatedAt', 'identityProfileLastLoginAt'].each { name ->
            def key = m.getPropertyKey(name)
            if (key == null) {
                if (!applySchema || installed) throw new IllegalStateException('Missing profile property')
                key = m.makePropertyKey(name).dataType(String.class).cardinality(Cardinality.SINGLE).make()
            }
            if (key.dataType() != String.class || key.cardinality() != Cardinality.SINGLE)
                throw new IllegalStateException('Profile property drift')
        }
        ['User', 'UserProfileRevision'].each { name ->
            def label = m.getVertexLabel(name)
            if (label == null) {
                if (!applySchema || installed) throw new IllegalStateException('Missing profile label')
                label = m.makeVertexLabel(name).make()
            }
            if (label.isPartitioned() || label.isStatic()) throw new IllegalStateException('Profile label drift')
        }
        def edge = m.getEdgeLabel('HAS_PROFILE_REVISION')
        if (edge == null) {
            if (!applySchema || installed) throw new IllegalStateException('Missing profile edge')
            edge = m.makeEdgeLabel('HAS_PROFILE_REVISION').multiplicity(Multiplicity.SIMPLE).make()
            m.setConsistency(edge, ConsistencyModifier.LOCK)
        }
        if (edge.multiplicity() != Multiplicity.SIMPLE || !edge.isDirected() || m.getConsistency(edge) != ConsistencyModifier.LOCK)
            throw new IllegalStateException('Profile edge drift')
        if (applySchema) m.commit() else m.rollback()
    } catch (Exception e) { m.rollback(); throw e }
    try {
        if (!installed) {
            if (!applySchema) throw new IllegalStateException('Profile completion record missing')
            g.addV('GraphSchema').property('graphSchemaName', 'cartyx_identity_profiles')
                .property('graphSchemaVersion', '0001').property('graphSchemaChecksum', checksum).iterate()
            graph.tx().commit()
        } else graph.tx().rollback()
        return 'identity-profiles:0001:verified'
    } catch (Exception e) { graph.tx().rollback(); throw e }
}
