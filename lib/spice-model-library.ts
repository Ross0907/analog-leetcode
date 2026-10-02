// Registry copied from the public model files in /spice-models; original notices are preserved there.
// Only numeric structural input can select these models; no user-authored model text is accepted.
export const STANDARD_SPICE_MODELS = {
  "1n4148": {
    "name": "D1N4148/TEMP",
    "label": "1N4148 switching diode",
    "line": ".MODEL D1N4148/TEMP   D      (\n+         IS = 1.27106E-8\n+         RS = 0.7546332\n+          N = 1.9215823\n+         TT = 3.679E-9\n+        CJO = 1.72434E-12\n+         VJ = 0.3026211\n+          M = 0.2\n+         EG = 1.11\n+        XTI = 3\n+         KF = 0\n+         AF = 1\n+         FC = 0.998001\n+         BV = 1E5\n+        IBV = 1.0E-10\n+ )",
    "sourceUrl": "https://ngspice.sourceforge.io/model-parameters/basic_models.7z"
  },
  "bc546b": {
    "name": "BC546B",
    "label": "BC546B NPN transistor",
    "line": ".model BC546B npn ( IS=7.59E-15 VAF=73.4 BF=480 IKF=0.0962 NE=1.2665\n+ ISE=3.278E-15 IKR=0.03 ISC=2.00E-13 NC=1.2 NR=1 BR=5 RC=0.25 CJC=6.33E-12\n+ FC=0.5 MJC=0.33 VJC=0.65 CJE=1.25E-11 MJE=0.55 VJE=0.65 TF=4.26E-10\n+ ITF=0.6 VTF=3 XTF=20 RB=100 IRB=0.0001 RBM=10 RE=0.5 TR=1.50E-07)",
    "sourceUrl": "https://ngspice.sourceforge.io/model-parameters/basic_models.7z"
  },
  "bc556b": {
    "name": "BC556B",
    "label": "BC556B PNP transistor",
    "line": ".model BC556B PNP(IS=3.83E-14 NF=1.008 ISE=1.22E-14 NE=1.528 BF=344.4 IKF=0.08039 VAF=21.11 NR=1.005 ISC=2.85E-13 NC=1.28 BR=14.84 IKR=0.047 VAR=32.02 RB=1 IRB=1.00E-06 RBM=1 RE=0.6202 RC=0.5713 XTB=0 EG=1.11 XTI=3 CJE=1.23E-11 VJE=0.6106 MJE=0.378 TF=5.60E-10 XTF=3.414 VTF=5.23 ITF=0.1483 PTF=0 CJC=1.08E-11 VJC=0.1022 MJC=0.3563 XCJC=0.6288 TR=1.00E-32 CJS=0 VJS=0.75 MJS=0.333 FC=0.8027)",
    "sourceUrl": "https://ngspice.sourceforge.io/model-parameters/basic_models.7z"
  },
  "irfp240": {
    "name": "IRFP240",
    "label": "IRFP240 N-channel power MOSFET",
    "line": ".model IRFP240 VDMOS nchan\n+ Vto=4 Kp=5.9 Lambda=.001 Theta=0.015 ksubthres=.27\n+ Rd=61m Rs=18m Rg=3 Rds=1e7\n+ Cgdmax=2.45n Cgdmin=10p a=0.3 Cgs=1.2n\n+ Is=60p N=1.1 Rb=14m XTI=3\n+ Cjo=1.5n Vj=0.8 m=0.5\n+ tcvth=0.0065 MU=-1.27 texp0=1.5\n+ Rthjc=0.4 Cthj=0.1\n+ mtriode=0.8",
    "sourceUrl": "https://ngspice.sourceforge.io/model-parameters/basic_models.7z"
  },
  "irfp9240": {
    "name": "IRFP9240",
    "label": "IRFP9240 P-channel power MOSFET",
    "line": ".model IRFP9240 VDMOS pchan\n+ Vto=-4 Kp=8.8 Lambda=.003 Theta=0.08 ksubthres=.35\n+ Rd=180m Rs=50m Rg=3 Rds=1e7\n+ Cgdmax=1.25n Cgdmin=50p a=0.23 Cgs=1.15n\n+ Is=150p N=1.3 Rb=16m XTI=2\n+ Cjo=1.3n Vj=0.8 m=0.5\n+ tcvth=0.004 MU=-1.27 texp0=1.5\n+ Rthjc=0.4 Cthj=0.1\n+ mtriode=0.6\n+ tnom=29",
    "sourceUrl": "https://ngspice.sourceforge.io/model-parameters/basic_models.7z"
  },
  "lm741": {
    "name": "LM741",
    "label": "LM741 operational amplifier",
    "line": ".SUBCKT LM741       1   2  99  50  28\nIOS 2 1 20N\nR1 1 3 250K\nR2 3 2 250K\nI1 4 50 100U\nR3 5 99 517\nR4 6 99 517\nQ1 5 2 4 QX\nQ2 6 7 4 QX\nC4 5 6 60.3614P\nI2 99 50 1.6MA\nEOS 7 107 16 49 1\nVOS 107 1 1E-3\nR8 99 49 40K\nR9 49 50 40K\nV2 99 8 1.63\nD1 9 8 DX\nD2 10 9 DX\nV3 10 50 1.63\nEH 99 98 99 49 1\nG1 98 9 5 6 2.1E-3\nR5 98 9 95.493MEG\nC3 98 9 333.33P\nG3 98 15 9 49 1E-6\nR12 98 15 1MEG\nC5 98 15 5.3052E-15\nG4 98 16 3 49 3.1623E-8\nL2 98 17 530.5M\nR13 17 16 1K\nF6 50 99 V6 1\nIOFF 50 99 450U\nE1 99 23 99 15 1\nR16 24 23 25\nD5 26 24 DX\nV6 26 22 0.65V\nR17 23 25 25\nD6 25 27 DX\nV7 22 27 0.65V\nV5 22 21 0.18V\nD4 21 15 DX\nV4 20 22 0.18V\nD3 15 20 DX\nL3 22 28 100P\nRL3 22 28 100K\n.MODEL DX D(IS=1E-15)\n.MODEL QX NPN(BF=625)\n.ENDS",
    "sourceUrl": "https://www.ti.com/lit/zip/SNOM211"
  }
} as const;
