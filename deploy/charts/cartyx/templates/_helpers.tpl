{{- define "cartyx.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cartyx.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "cartyx.labels" -}}
app.kubernetes.io/name: {{ include "cartyx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "cartyx.web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cartyx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "cartyx.realtime.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cartyx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: realtime
{{- end -}}

{{- define "cartyx.audioWorker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cartyx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: audio-worker
{{- end -}}

{{- define "cartyx.secretName" -}}
{{- if .Values.secret.existingSecret -}}
{{- .Values.secret.existingSecret -}}
{{- else -}}
{{- include "cartyx.fullname" . -}}
{{- end -}}
{{- end -}}
{{/* Data-store environment and credential mount, shared by the three workloads. */}}
{{- define "cartyx.data.env" -}}
{{- if .Values.data.enabled }}
- name: GREMLIN_URL
  value: {{ printf "wss://%s:%v/gremlin" .Values.data.graph.service .Values.data.graph.port | quote }}
- name: GREMLIN_USERNAME
  value: {{ required "data.graph.username is required" .Values.data.graph.username | quote }}
- name: GREMLIN_PASSWORD_FILE
  value: /var/run/cartyx-data/gremlin-app-password
- name: GREMLIN_CA_FILE
  value: /var/run/cartyx-data/tls.crt
- name: CQL_CONTACT_POINT
  value: {{ .Values.data.cql.service | quote }}
- name: CQL_TLS_SERVER_NAME
  value: {{ .Values.data.cql.service | quote }}
- name: CQL_PORT
  value: {{ .Values.data.cql.port | quote }}
- name: CQL_DATACENTER
  value: {{ .Values.data.cql.datacenter | quote }}
- name: CQL_STATE_KEYSPACE
  value: {{ required "data.cql.stateKeyspace is required when data.enabled" .Values.data.cql.stateKeyspace | quote }}
- name: CQL_PASSWORD_FILE
  value: /var/run/cartyx-data/cassandra-state-password
- name: CQL_CA_FILE
  value: /var/run/cartyx-data/tls.crt
{{- end }}
{{- end -}}

{{/* Read-only mount of the application data credentials. */}}
{{- define "cartyx.data.volumeMount" -}}
{{- if .Values.data.enabled }}
- name: data-credentials
  mountPath: /var/run/cartyx-data
  readOnly: true
{{- end }}
{{- end -}}

{{- define "cartyx.data.volume" -}}
{{- if .Values.data.enabled }}
- name: data-credentials
  secret:
    secretName: {{ .Values.data.secretName | quote }}
    defaultMode: 0440
    items:
      - { key: gremlin-app-password, path: gremlin-app-password }
      - { key: cassandra-state-password, path: cassandra-state-password }
      - { key: tls.crt, path: tls.crt }
{{- end }}
{{- end -}}

{{/* The database NetworkPolicy admits only labelled clients. */}}
{{- define "cartyx.data.podLabels" -}}
{{- if .Values.data.enabled }}
cartyx.io/data-client: 'true'
{{- end }}
{{- end -}}
