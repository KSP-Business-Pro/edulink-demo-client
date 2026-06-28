
# Patch B5.4 RH Personnel

# App.tsx
with open("src/App.tsx", "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace(
    "const PortailEnseignantPage = lazy(() => import('./modules/portail-enseignant'));",
    "const PortailEnseignantPage = lazy(() => import('./modules/portail-enseignant'));\nconst RHPersonnelPage       = lazy(() => import('./modules/rh-personnel'));"
)
c = c.replace(
    '<Route path="/portail-enseignant"',
    '<Route path="/rh-personnel" element={<AppRoute page="rh-personnel"><RHPersonnelPage /></AppRoute>} />\n          <Route path="/portail-enseignant"'
)
with open("src/App.tsx", "w", encoding="utf-8") as f:
    f.write(c)
print("App.tsx OK")

# AppLayout
with open("src/components/AppLayout.tsx", "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace(
    "{ id: 'portail-enseignant', label: 'Portail Enseignant',",
    "{ id: 'rh-personnel', label: 'RH & Personnel', ico: '\U0001f3e2', href: '/rh-personnel' },\n      { id: 'portail-enseignant', label: 'Portail Enseignant',"
)
with open("src/components/AppLayout.tsx", "w", encoding="utf-8") as f:
    f.write(c)
print("AppLayout.tsx OK")

# permissions.ts
with open("src/services/permissions.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

result = []
for i, line in enumerate(lines):
    result.append(line)
    if "voir_portail_enseignant: boolean;" in line and i+1 < len(lines) and "voir_rh" not in lines[i+1]:
        result.append("  voir_rh_personnel: boolean;\n")
    if "voir_portail_enseignant: true," in line and "voir_rh" not in line:
        result[-1] = line.rstrip() + " voir_rh_personnel: true,\n"
    if "voir_portail_enseignant: false," in line and "voir_rh" not in line:
        result[-1] = line.rstrip() + " voir_rh_personnel: false,\n"

# Activer pour admin et direction
final = []
for i, line in enumerate(result):
    final.append(line)

# getVisibleModules
output = []
for line in final:
    output.append(line)
    if "voir_portail_enseignant" in line and "modules.push" in line and "voir_rh" not in line:
        output.append("  if (p.voir_rh_personnel)      modules.push('rh-personnel');\n")

with open("src/services/permissions.ts", "w", encoding="utf-8") as f:
    f.writelines(output)
print("permissions.ts OK")
