"""Refaz os pesos de skin de um GLB a partir do próprio esqueleto, no Blender.

    blender --background --python repesar.py -- --in <entrada.glb> --out <saida.glb>

Por que existe: a transferência por proximidade do `convert-tripo.mjs` produz um
GRADIENTE de pesos (só 6% dos vértices da mestre pertencem a um osso só, contra
63% num corpo rigado à mão), e nenhum remendo local converte gradiente em ilha.
O peso automático do Blender (bone heat) resolve o Laplaciano da malha por osso,
que é justamente o que produz ilha: miolo de osso único e faixa estreita de
transição na junta.

Ossos que NÃO deformam (ficam no esqueleto, sem peso nenhum):
  - `root`: é o pivô do corpo, não parte do corpo;
  - `*_leaf`: pontas de cadeia, não têm volume;
  - dedos: a mestre é um manequim sem dedos modelados, e deixar bone heat
    repartir a superfície da mão entre 20 ossos é exatamente o borrão que
    estamos tirando. A mão inteira fica em `hand_l`/`hand_r`.

`--com-dedos` devolve os 20 ossos de dedo ao grupo de deformação. Está aqui só
para poder remedir: MEDIDO em 2026-09-20, ligar os dedos PIORA o braço em tudo
— estiramento médio 11,9% → 21,3% no CRT-012, 14,6% → 34,0% no CRT-006. A
hipótese de que a metade externa do braço estava órfã por falta de osso de dedo
foi testada e é falsa; sem dedos é melhor.

O esqueleto sai com os 55 ossos (o exportador leva todos, não só os que
deformam), então o contrato de nome/contagem com a UAL não muda.
"""

import sys
import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if f"--{name}" in argv:
        i = argv.index(f"--{name}")
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


SRC = arg("in")
DST = arg("out")
if not SRC or not DST:
    print("ERRO: faltou --in ou --out")
    sys.exit(1)

NO_DEFORM_PREFIX = () if "--com-dedos" in argv else ("index_", "middle_", "ring_", "pinky_", "thumb_")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
mesh = next((o for o in bpy.data.objects if o.type == "MESH"), None)
if arm is None or mesh is None:
    print(f"ERRO: esperava uma malha e um esqueleto; achei armature={arm} mesh={mesh}")
    sys.exit(1)

# Pose de repouso de referência, para conferir no fim que o round-trip não mexeu
# no esqueleto — é dela que o jogo depende para a UAL casar.
rest_before = {b.name: (arm.matrix_world @ b.head_local).copy() for b in arm.data.bones}
print(f"entrada: malha '{mesh.name}' {len(mesh.data.vertices)} vért., esqueleto {len(arm.data.bones)} ossos")

# Quem deforma.
deform, skipped = [], []
for b in arm.data.bones:
    n = b.name
    if n == "root" or n.endswith("_leaf") or n.startswith(NO_DEFORM_PREFIX):
        b.use_deform = False
        skipped.append(n)
    else:
        b.use_deform = True
        deform.append(n)
print(f"deformam: {len(deform)} osso(s) — {', '.join(deform)}")
print(f"não deformam: {len(skipped)} osso(s) (root, pontas e dedos)")

# Solda as costuras. A malha do Tripo duplica vértice em costura de UV, e o
# bone heat resolve o Laplaciano sobre a TOPOLOGIA: cada costura é um corte que
# o solver enxerga como borda, e o peso sai partido de um lado para o outro.
# Na mestre isso é grátis — ela é gabarito de argila, sem textura e sem UV que
# interesse (`make-master.mjs` já tira material e coordenada extra).
bpy.context.view_layer.objects.active = mesh
for o in bpy.data.objects:
    o.select_set(False)
mesh.select_set(True)
before = len(mesh.data.vertices)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-4)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
mesh.data.validate(verbose=False)
print(f"solda: {before} → {len(mesh.data.vertices)} vértices ({before - len(mesh.data.vertices)} costura(s) fechada(s))")

# Zera o que veio do arquivo: grupos de vértice e modificador de armadura.
mesh.vertex_groups.clear()
for m in list(mesh.modifiers):
    if m.type == "ARMATURE":
        mesh.modifiers.remove(m)
mesh.parent = None

bpy.context.view_layer.objects.active = None
for o in bpy.data.objects:
    o.select_set(False)
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm

try:
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
except RuntimeError as err:
    print(f"ERRO: peso automático falhou — {err}")
    print("  (plano B: 'Geodesic Voxel' via bpy.ops.paint.weight_from_bones ou limpar a malha antes)")
    sys.exit(1)

# O glTF só carrega 4 ossos por vértice: melhor o Blender escolher e
# renormalizar (ele redistribui o que sobra) do que o exportador truncar. E
# peso abaixo de 1% não move nada — é exatamente o ruído que vira gradiente.
bpy.context.view_layer.objects.active = mesh
for o in bpy.data.objects:
    o.select_set(False)
mesh.select_set(True)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)

# Quantos ossos por vértice — a métrica que separa ilha de gradiente.
hist = {}
for v in mesh.data.vertices:
    n = sum(1 for g in v.groups if g.weight > 0.001)
    hist[n] = hist.get(n, 0) + 1
total = len(mesh.data.vertices)
print("ossos por vértice: " + "  ".join(
    f"{k}→{hist[k]} ({hist[k] / total * 100:.0f}%)" for k in sorted(hist)))

over = sum(1 for v in mesh.data.vertices if sum(1 for g in v.groups if g.weight > 0.001) > 4)
if over:
    print(f"AVISO: {over} vértice(s) com mais de 4 ossos; o exportador glTF mantém os 4 maiores")

bpy.ops.export_scene.gltf(
    filepath=DST,
    export_format="GLB",
    export_skins=True,
    export_def_bones=False,   # leva TODOS os ossos, não só os que deformam
    export_animations=False,
    export_yup=True,
    use_selection=False,
)

# Confere que o esqueleto voltou igual.
worst, worst_bone = 0.0, ""
for b in arm.data.bones:
    d = (arm.matrix_world @ b.head_local - rest_before[b.name]).length
    if d > worst:
        worst, worst_bone = d, b.name
print(f"pose de repouso: maior desvio {worst * 1000:.3f} mm ({worst_bone})")
print(f"escrito: {DST}")
