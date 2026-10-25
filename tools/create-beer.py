"""Rebuild with: blender --background --python tools/create-beer.py"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
root = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(17)
def mat(name, color, roughness, metallic=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness; p.inputs['Metallic'].default_value=metallic
    return m
glass=mat('Crystal',(.8,.95,1),.08)
beer=mat('Amber',(.65,.19,.012),.18)
foam=mat('Foam',(.96,.88,.66),.85)
def lathe(name, profile, material):
    verts=[]; faces=[]; n=32
    for r,z in profile:
        for i in range(n):
            a=2*math.pi*i/n; verts.append((r*math.cos(a),r*math.sin(a),z))
    for j in range(len(profile)-1):
        for i in range(n):
            a=j*n+i; b=j*n+(i+1)%n; faces.append((a,b,b+n,a+n))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(material)
    for p in mesh.polygons:p.use_smooth=True
    return obj
lathe('Glass',[(0,0),(.52,0),(.58,.06),(.59,.18),(.79,2.38),(.79,2.44),(.76,2.46),(.73,2.43),(.73,2.37),(.535,.18),(0,.18)],glass)
lathe('Liquid',[(0,.19),(.53,.19),(.724,2.22),(0,2.22)],beer)
lathe('Head',[(0,2.19),(.723,2.19),(.742,2.3),(.72,2.38),(0,2.38)],foam)
# A low-poly draught tap above the pint, with a short down-facing nozzle.
chrome=mat('Chrome',(.55,.49,.35),.25,.8)
parts=[]
def pipe(start, end, radius):
    delta=Vector(end)-Vector(start)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=delta.length,location=(Vector(start)+Vector(end))/2)
    o=bpy.context.object
    o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    parts.append(o)
pipe((-1.15,0,3.45),(-.24,0,3.45),.13)
pipe((-.24,0,3.45),(-.24,0,3.06),.09)
pipe((-1.15,0,3.29),(-1.15,0,3.61),.21)
pipe((-.6,0,3.45),(-.6,0,3.69),.065)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join()
bpy.context.object.name='Tap';bpy.context.object.data.materials.append(chrome)
# Handle origin at its hinge, so Three.js can open and close it.
handle=mat('Handle',(.12,.06,.025),.3)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1,location=(-.6,0,3.87))
o=bpy.context.object;o.name='TapHandle';o.scale=(.10,.10,.26)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.context.scene.cursor.location=(-.6,0,3.65)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR');o.data.materials.append(handle)
# Reusable rounded ice mesh; animate three clones in the browser.
bpy.ops.mesh.primitive_cube_add(size=.34,location=(0,0,0))
o=bpy.context.object;o.name='Ice'
bevel=o.modifiers.new('Soft edges','BEVEL');bevel.width=.045;bevel.segments=1
bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
o.data.materials.append(mat('IceMaterial',(.56,.83,.96),.14))
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'Assets/models/beer.blend'))
bpy.ops.export_scene.gltf(filepath=str(root/'Assets/models/beer.glb'),export_format='GLB',export_yup=True)
