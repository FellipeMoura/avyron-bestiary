"""Resolve o peso por difusão (bone heat) de uma malha contra segmentos de osso.

    blender --background --python pesar-mestre.py -- --in <fit.json> --out <pesos.json>

Quem chama é o `build-master.mjs`; não se roda à mão. O Blender aqui é SÓ o
solver: entra um JSON (malha soldada + segmentos de osso), sai um JSON (peso por
vértice por osso). Ele não lê nem escreve GLB — o esqueleto de verdade, com as
rotações de repouso da UAL e as matrizes de bind, é montado no Node, número a
número. Manter o importador e o exportador de glTF do Blender fora do caminho é
o que garante o contrato com a UAL (orientação de osso, ordem de vértice, sem
divisão de vértice por normal) e deixa o SEGMENTO de cada osso ser declarado em
vez de adivinhado: `Head` vai da base do crânio ao topo da cabeça, `hand` do
punho à ponta da mão — que é o que o solver precisa enxergar para pintar a
cabeça e a mão como ilhas.

Formato de entrada:
    { "vertices": [[x,y,z],...], "triangles": [[a,b,c],...],
      "bones": [{"name","head":[x,y,z],"tail":[x,y,z],"parent":nome|null}] }
Saída:
    { "bones": [nomes], "weights": [[[iOsso, peso],...] por vértice] }

Só entram ossos que deformam; o solver não conhece eixo (Y-up ou Z-up dá o
mesmo resultado), então as coordenadas passam cruas.
"""

import json
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if f"--{name}" in argv:
        i = argv.index(f"--{name}")
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


SRC, DST = arg("in"), arg("out")
if not SRC or not DST:
    print("ERRO: faltou --in ou --out")
    sys.exit(1)

with open(SRC, "r", encoding="utf-8") as fh:
    data = json.load(fh)

bpy.ops.wm.read_factory_settings(use_empty=True)

me = bpy.data.meshes.new("Mestre")
me.from_pydata([tuple(v) for v in data["vertices"]], [], [tuple(t) for t in data["triangles"]])
me.validate(verbose=False)
me.update()
if len(me.vertices) != len(data["vertices"]):
    # `validate` não remove vértice, só face/aresta inválida; se isto disparar, a
    # correspondência de índice com o Node se perdeu e o resultado não presta.
    print(f"ERRO: a malha mudou de {len(data['vertices'])} para {len(me.vertices)} vértices")
    sys.exit(1)
mesh = bpy.data.objects.new("Mestre", me)
bpy.context.collection.objects.link(mesh)

# Normais para fora: o bone heat usa visibilidade osso → vértice, e face
# invertida conta como parede.
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
if len(me.vertices) != len(data["vertices"]):
    print("ERRO: a contagem de vértices mudou ao recalcular normais")
    sys.exit(1)

arm_data = bpy.data.armatures.new("Esqueleto")
arm = bpy.data.objects.new("Esqueleto", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
made = {}
for b in data["bones"]:
    eb = arm_data.edit_bones.new(b["name"])
    eb.head = b["head"]
    eb.tail = b["tail"]
    made[b["name"]] = eb
for b in data["bones"]:
    if b.get("parent") and b["parent"] in made:
        made[b["name"]].parent = made[b["parent"]]
bpy.ops.object.mode_set(mode="OBJECT")
names = [b["name"] for b in data["bones"]]
if len(arm_data.bones) != len(names):
    print("ERRO: osso de comprimento zero foi descartado pelo Blender")
    sys.exit(1)

for o in bpy.data.objects:
    o.select_set(False)
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
try:
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
except RuntimeError as err:
    print(f"ERRO: peso automático falhou — {err}")
    sys.exit(1)

index = {n: i for i, n in enumerate(names)}
group_bone = {g.index: index[g.name] for g in mesh.vertex_groups if g.name in index}
out = []
orphans = 0
for v in me.vertices:
    row = [[group_bone[g.group], round(g.weight, 6)] for g in v.groups if g.group in group_bone and g.weight > 1e-5]
    if not row:
        orphans += 1
    out.append(row)
# Vértice sem peso é o sinal de que o solver falhou num trecho ("failed to find
# solution for one or more bones" sai como aviso, não como exceção).
print(f"pesos: {len(out)} vértices, {len(names)} ossos, {orphans} vértice(s) sem influência")

with open(DST, "w", encoding="utf-8") as fh:
    json.dump({"bones": names, "weights": out, "orphans": orphans}, fh)
print(f"escrito: {DST}")
