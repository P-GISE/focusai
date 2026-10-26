{{- $known := false -}}
{{- range . -}}{{- if and (eq .Class "os-pkgs") (eq .Type "alpine") -}}{{- $known = true -}}{{- end -}}{{- end -}}
{"known_os": {{ $known }}, "results": [
{{- range $i, $result := . }}{{if $i}},{{end}}
{"os_packages": {{if and (eq $result.Class "os-pkgs") (eq $result.Type "alpine")}}true{{else}}false{{end}}, "node_packages": {{if and (eq $result.Class "lang-pkgs") (or (eq $result.Type "node-pkg") (eq $result.Type "npm"))}}true{{else}}false{{end}}, "packages": {{len $result.Packages}}, "severities": [
{{- range $j, $v := $result.Vulnerabilities }}{{if $j}},{{end}}
{{- if eq $v.Severity "CRITICAL"}}"CRITICAL"{{else if eq $v.Severity "HIGH"}}"HIGH"{{else if eq $v.Severity "MEDIUM"}}"MEDIUM"{{else if eq $v.Severity "LOW"}}"LOW"{{else}}"UNKNOWN"{{end}}
{{- end }}]}
{{- end }}]}
