"""Synthetic OS + Node-library image gate checks; no scanner, Docker or network."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
GATE=Path(__file__).with_name('image-summary.py')
SECRET='SYNTHETIC_SECRET_MUST_NEVER_APPEAR'
def report(os_severities=(),node_severities=(),known=True,os_packages=12,node_packages=8):
 return {'known_os':known,'results':[{'os_packages':True,'node_packages':False,'packages':os_packages,'severities':list(os_severities)},{'os_packages':False,'node_packages':True,'packages':node_packages,'severities':list(node_severities)}]}
class RuntimeGate(unittest.TestCase):
 def run_gate(self,data,status=0):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'safe.json';path.write_text(data if isinstance(data,str) else json.dumps(data),encoding='utf-8')
   return subprocess.run([sys.executable,'-X','utf8',str(GATE),str(path),str(status)],capture_output=True,text=True,check=False)
 def test_os_and_library_high_critical_each_block_even_with_exit_zero(self):
  for scope in ['os','node']:
   for severity in ['HIGH','CRITICAL']:
    with self.subTest(scope=scope,severity=severity):
     result=self.run_gate(report([severity] if scope=='os' else [],[severity] if scope=='node' else []));self.assertEqual(result.returncode,1);summary=json.loads(result.stdout);self.assertEqual(summary['severity_counts'][severity],1);self.assertEqual(summary['status'],'BLOCKED')
 def test_clean_both_inventories_and_all_severity_counts_are_visible(self):
  result=self.run_gate(report(['LOW'],['MEDIUM','UNKNOWN']));self.assertEqual(result.returncode,0,result.stderr);summary=json.loads(result.stdout)
  self.assertEqual(summary['severity_counts'],{'UNKNOWN':1,'LOW':1,'MEDIUM':1,'HIGH':0,'CRITICAL':0});self.assertEqual(summary['os_package_inventory'],12);self.assertEqual(summary['node_package_inventory'],8);self.assertEqual(summary['os_severity_counts']['LOW'],1);self.assertEqual(summary['node_severity_counts']['MEDIUM'],1)
 def test_unknown_os_missing_either_inventory_and_scanner_errors_block(self):
  for data,status in [(report(known=False),0),(report(os_packages=0),0),(report(node_packages=0),0),({'known_os':True,'results':[]},0),(report(),1),(report(),2)]:
   with self.subTest(data=data,status=status):self.assertEqual(self.run_gate(data,status).returncode,1)
 def test_legacy_os_only_report_cannot_prove_library_coverage(self):
  data={'known_os':True,'results':[{'os_packages':True,'packages':12,'severities':[]}]};self.assertEqual(self.run_gate(data).returncode,1)
 def test_arbitrary_package_inventory_cannot_count_as_node_coverage(self):
  data=report();data['results'][1]['node_packages']=False;self.assertEqual(self.run_gate(data).returncode,1)
 def test_malformed_types_ambiguous_scope_and_unknown_severity_block(self):
  for kind in ['boolean_count','negative_count','both_scopes','unknown_severity','missing_field']:
   data=report()
   if kind=='boolean_count':data['results'][1]['packages']=True
   elif kind=='negative_count':data['results'][1]['packages']=-1
   elif kind=='both_scopes':data['results'][1]['os_packages']=True
   elif kind=='unknown_severity':data['results'][1]['severities']=['NEW_SEVERITY']
   else:del data['results'][1]['packages']
   with self.subTest(kind=kind):self.assertEqual(self.run_gate(data).returncode,1)
 def test_raw_config_target_env_and_marker_never_escape(self):
  for data in [SECRET,{'ArtifactName':SECRET},{**report(),'Config':{'Env':[SECRET]}},report([SECRET]),{**report(),'Target':SECRET}]:
   with self.subTest(data=data):
    result=self.run_gate(data);self.assertEqual(result.returncode,1);self.assertNotIn(SECRET,result.stdout+result.stderr);self.assertEqual(result.stderr,'')
if __name__=='__main__':unittest.main()
