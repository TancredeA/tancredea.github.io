# Placeholder model for the digits demo. Run from the site root:
#   pip install scikit-learn scipy numpy && python3 tools/train_digits.py
# Writes assets/digits-mlp.json, read by js/demos.js (inference in plain JS).
import json, numpy as np
from sklearn.datasets import load_digits
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from scipy.ndimage import zoom, affine_transform
rng=np.random.default_rng(0)
X,y=load_digits(return_X_y=True); X=X/16.0
Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=0.2,random_state=0,stratify=y)
def normalize(img32):
    # same as the browser: bounding box of the ink fitted into 32x32 (aspect kept, centred), 4x4 block means
    m=img32>0.15
    if not m.any(): return np.zeros(64)
    ys,xs=np.where(m); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    crop=img32[y0:y1,x0:x1]; s=32/max(crop.shape)
    z=np.clip(zoom(crop,s,order=1),0,1); h,w=z.shape; h=min(h,32); w=min(w,32); z=z[:h,:w]
    out=np.zeros((32,32)); oy=(32-h)//2; ox=(32-w)//2; out[oy:oy+h,ox:ox+w]=z
    return out.reshape(8,4,8,4).mean(axis=(1,3)).ravel()
def augment(x,k):
    img=np.clip(zoom(x.reshape(8,8),4,order=1),0,1)
    res=[]
    for _ in range(k):
        a=np.deg2rad(rng.uniform(-14,14)); sx=rng.uniform(0.75,1.3); sy=rng.uniform(0.85,1.15); sh=rng.uniform(-0.25,0.25)
        A=np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]])@np.array([[sy,0],[sh,sx]])
        Ai=np.linalg.inv(A); c=np.array([16,16]); off=c-Ai@c
        big=np.zeros((32,32)); t=affine_transform(img,Ai,offset=off,order=1,mode='constant')
        # random stroke thickening
        if rng.random()<0.5:
            t=np.maximum(t,np.maximum(np.roll(t,1,0),np.roll(t,1,1)))
        res.append(normalize(np.clip(t,0,1)))
    return res
def prep(Xs,ys,k):
    A=[];B=[]
    for x,l in zip(Xs,ys):
        A.append(normalize(np.clip(zoom(x.reshape(8,8),4,order=1),0,1))); B.append(l)
        for v in augment(x,k): A.append(v); B.append(l)
    return np.array(A),np.array(B)
A,B=prep(Xtr,ytr,8); At,Bt=prep(Xte,yte,0)
m=MLPClassifier(hidden_layer_sizes=(96,),alpha=3e-3,max_iter=300,random_state=0).fit(A,B)
print("held-out accuracy (renormalised test digits):",round(m.score(At,Bt),4))
w={"W1":np.round(m.coefs_[0],4).tolist(),"b1":np.round(m.intercepts_[0],4).tolist(),"W2":np.round(m.coefs_[1],4).tolist(),"b2":np.round(m.intercepts_[1],4).tolist(),
   "input":"8x8 in [0,1]: ink bounding box fitted into 32x32 (aspect kept, centred), then 4x4 block means",
   "source":"scikit-learn load_digits (UCI optdigits), MLP 64-96-10 ReLU, affine augmentation",
   "heldout_accuracy":round(m.score(At,Bt),4)}
json.dump(w,open("assets/digits-mlp.json","w"),separators=(",",":"))
