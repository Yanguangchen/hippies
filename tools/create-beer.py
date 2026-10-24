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
    verts=[]; faces=[]; n=96
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
# A gently irregular foam crown, joined to keep draw calls low.
parts=[]
for i in range(85):
    a=random.random()*math.tau; r=math.sqrt(random.random())*.69
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=random.uniform(.05,.105),location=(r*math.cos(a),r*math.sin(a),2.365))
    o=bpy.context.object; o.scale.z=.48; parts.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); bpy.context.object.name='FoamCrown'; bpy.context.object.data.materials.append(foam)
# Condensation is actual geometry, distributed over the outside of the glass.
parts=[]
for i in range(95):
    z=random.uniform(.25,2.25); a=random.random()*math.tau; r=.58+.20*z/2.4
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.008,.024),location=(r*math.cos(a),r*math.sin(a),z))
    o=bpy.context.object; o.scale.z=1.6; parts.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); bpy.context.object.name='Condensation'; bpy.context.object.data.materials.append(glass)
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
bpy.ops.wm.save_as_mainfile(filepath=str(root/'Assets/models/beer.blend'))
bpy.ops.export_scene.gltf(filepath=str(root/'Assets/models/beer.glb'),export_format='GLB',export_yup=True)
