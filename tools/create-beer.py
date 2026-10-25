"""Rebuild with: blender --background --python tools/create-beer.py"""
import bpy, bmesh, math
from pathlib import Path
root = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def mat(name, color, roughness, metallic=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness; p.inputs['Metallic'].default_value=metallic
    return m
glass=mat('Crystal',(.8,.95,1),.08)
beer=mat('Amber',(.65,.19,.012),.18)
foam=mat('Foam',(.96,.88,.66),.85)
chrome=mat('Chrome',(.8,.8,.82),.12,1)
brass=mat('Brass',(.86,.62,.3),.25,1)
grip=mat('HandleBlack',(.02,.018,.016),.2)
def finish(obj, material, sharp=35):
    """Outward normals, smooth shading, and crisp edges past `sharp` degrees."""
    bm=bmesh.new(); bm.from_mesh(obj.data); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(obj.data); bm.free()
    obj.data.shade_smooth(); obj.data.set_sharp_from_angle(angle=math.radians(sharp))
    obj.data.materials.append(material); return obj
def build(name, verts, faces, material, sharp=35):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    return finish(obj,material,sharp)
def lathe(name, profile, material, segments=32, axis='Z', at=(0,0,0), radius=None, sharp=35):
    """Revolve (r, t) points around an axis; t runs along it, r=0 points become poles.
    `radius(r, t, angle)` may reshape a ring, e.g. for fluting."""
    def place(u,v,t):
        x,y,z=(u,v,t) if axis=='Z' else (t,u,v)
        return (x+at[0],y+at[1],z+at[2])
    verts=[]; rings=[]; faces=[]
    for r,t in profile:
        if r==0: rings.append([len(verts)]); verts.append(place(0,0,t)); continue
        ring=[]
        for k in range(segments):
            a=2*math.pi*k/segments; rr=radius(r,t,a) if radius else r
            ring.append(len(verts)); verts.append(place(rr*math.cos(a),rr*math.sin(a),t))
        rings.append(ring)
    for lo,hi in zip(rings,rings[1:]):
        for k in range(segments):
            k2=(k+1)%segments
            if len(lo)==1: faces.append((lo[0],hi[k],hi[k2]))
            elif len(hi)==1: faces.append((lo[k],lo[k2],hi[0]))
            else: faces.append((lo[k],lo[k2],hi[k2],hi[k]))
    return build(name,verts,faces,material,sharp)
def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
    bpy.context.object.name=name; bpy.context.object.data.name=name
    return bpy.context.object
def smoothstep(t,a,b):
    x=min(1,max(0,(t-a)/(b-a))); return x*x*(3-2*x)

# Heavy glass beer mug: a thick base, twelve flutes around the lower half, a bead,
# a smooth band for the printed logo, and a rolled rim. The beer sits from z=.314.
outer_radius=lambda z:.752+.008*(z-.26)/1.94
flutes=lambda z:smoothstep(z,.28,.44)*(1-smoothstep(z,1.16,1.32))
outer=[(outer_radius(z),z) for z in (.26,.3,.34,.38,.42,.5,1.1,1.14,1.18,1.22,1.26,1.3,1.36)]
bead=[(outer_radius(1.375)+.012,1.375),(outer_radius(1.4)+.014,1.4),(outer_radius(1.425)+.012,1.425),(outer_radius(1.44),1.44),(.76,2.2)]
profile=([(0,0),(.62,0),(.69,.01),(.728,.04),(.748,.1),(.752,.2)]+outer+bead+
    [(.76,2.25),(.757,2.282),(.746,2.303),(.727,2.313),(.705,2.308),(.686,2.291),(.675,2.262),(.672,2.2),
     (.663,.36),(.655,.33),(.64,.312),(0,.312)])
fluted={round(z,4) for _,z in outer}
mug=lathe('Mug',profile,glass,48,radius=lambda r,t,a:r-.03*flutes(t)*math.sin(6*a)**2 if round(t,4) in fluted else r,sharp=50)
# D-shaped handle swept along a Catmull-Rom path, ends buried in the wall.
path=[(.5,1.96),(.72,1.98),(.95,2.02),(1.2,1.94),(1.34,1.7),(1.37,1.35),(1.3,.98),(1.12,.7),(.9,.6),(.72,.58),(.5,.58)]
samples=[]
for i in range(1,len(path)-2):
    p0,p1,p2,p3=path[i-1:i+3]
    for s in range(4 if i<len(path)-3 else 5):
        u=s/4
        samples.append(tuple(.5*(2*p1[j]+(-p0[j]+p2[j])*u+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*u*u+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*u**3) for j in (0,1)))
verts=[]; faces=[]; n=12
for i,(x,z) in enumerate(samples):
    a,b=samples[max(0,i-1)],samples[min(len(samples)-1,i+1)]
    tx,tz=b[0]-a[0],b[1]-a[1]; length=math.hypot(tx,tz); nx,nz=-tz/length,tx/length
    for k in range(n):
        f=2*math.pi*k/n; verts.append((x+nx*.085*math.cos(f),.105*math.sin(f),z+nz*.085*math.cos(f)))
for i in range(len(samples)-1):
    for k in range(n): faces.append((i*n+k,i*n+(k+1)%n,(i+1)*n+(k+1)%n,(i+1)*n+k))
for end,ring in ((len(verts),0),(len(verts)+1,len(samples)-1)):
    verts.append((samples[ring][0],0,samples[ring][1]))
    faces+=[(end,ring*n+(k+1)%n,ring*n+k) for k in range(n)]
join([mug,build('MugHandle',verts,faces,glass,60)],'Mug')
lathe('Liquid',[(0,.314),(.645,.314),(.66,.33),(.669,2.2),(0,2.2)],beer,48)
lathe('Head',[(0,2.17),(.665,2.17),(.669,2.27),(.655,2.33),(.6,2.37),(.45,2.395),(0,2.405)],foam,48)

# Chrome beer tower standing on the bar, with shank, hex coupling nut, faucet body,
# spout and lever bonnet. The faucet faces +x; its spout tip is at (-.17, 2.814).
fz=3.24; tower=(-1.55,0,0)
parts=[lathe('Tower',[(0,0),(.36,0),(.372,.012),(.372,.042),(.355,.058),(.27,.072),(.225,.1),(.205,.16),(.2,.21),
        (.18,.235),(.165,.25),(.165,2.88),(.18,2.9),(.2,2.94),(.205,2.98),(.205,3.52),(.198,3.56),(.178,3.62),
        (.14,3.67),(.08,3.705),(0,3.715)],chrome,32,at=tower),
    lathe('Finial',[(0,3.705),(.028,3.71),(.044,3.735),(.04,3.765),(.02,3.782),(0,3.786)],chrome,24,at=tower),
    lathe('Shank',[(0,-1.42),(.05,-1.42),(.05,-1.12),(0,-1.12)],chrome,24,'X',(0,0,fz)),
    lathe('Nut',[(0,-1.25),(.088,-1.25),(.102,-1.235),(.102,-1.135),(.088,-1.12),(0,-1.12)],chrome,6,'X',(0,0,fz)),
    lathe('Faucet',[(0,-1.12),(.066,-1.12),(.072,-1.09),(.072,-1.04),(.094,-1.01),(.11,-.95),(.115,-.7),(.113,-.32),
        (.106,-.2),(.092,-.13),(.068,-.09),(.036,-.07),(0,-.064)],chrome,32,'X',(0,0,fz)),
    lathe('Spout',[(0,fz-.02),(.054,fz-.02),(.054,fz-.2),(.047,fz-.34),(.05,fz-.38),(.057,fz-.395),(.057,fz-.418),
        (.043,fz-.426),(0,fz-.426)],chrome,24,at=(-.17,0,0)),
    lathe('Bonnet',[(0,fz+.08),(.068,fz+.08),(.074,fz+.13),(.074,fz+.17),(.064,fz+.19),(.045,fz+.2),(0,fz+.2)],chrome,24,at=(-.66,0,0))]
join(parts,'Tap')
# Lever, brass ferrule and tall black tap handle; origin at the hinge so Three.js can pull it.
z0=fz+.38
lever=[lathe('Lever',[(0,fz+.15),(.03,fz+.15),(.03,fz+.32),(0,fz+.32)],chrome,16,at=(-.66,0,0)),
    lathe('Ferrule',[(0,fz+.3),(.058,fz+.3),(.066,fz+.315),(.066,fz+.37),(.058,fz+.385),(0,fz+.385)],brass,24,at=(-.66,0,0)),
    lathe('Grip',[(0,z0),(.06,z0),(.064,z0+.04),(.058,z0+.075),(.066,z0+.11),(.077,z0+.22),(.088,z0+.4),(.096,z0+.56),
        (.099,z0+.64),(.095,z0+.69),(.082,z0+.725),(.055,z0+.748),(0,z0+.756)],grip,24,at=(-.66,0,0))]
handle=join(lever,'TapHandle')
bpy.context.scene.cursor.location=(-.66,0,fz+.16)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
# Reusable rounded ice mesh; animate three clones in the browser.
bpy.ops.mesh.primitive_cube_add(size=.34,location=(0,0,0))
o=bpy.context.object;o.name='Ice'
bevel=o.modifiers.new('Soft edges','BEVEL');bevel.width=.045;bevel.segments=1
bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
o.data.materials.append(mat('IceMaterial',(.56,.83,.96),.14)); o.data.shade_smooth()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'Assets/models/beer.blend'))
bpy.ops.export_scene.gltf(filepath=str(root/'Assets/models/beer.glb'),export_format='GLB',export_yup=True)
