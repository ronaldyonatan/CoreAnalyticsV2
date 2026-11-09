import os
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from migrate_parquet_volume import migrate,inventory


class StorageMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'source';self.target=self.root/'destination'
        self.source.mkdir();self.target.mkdir()
    def copy(self):return migrate(self.source,self.target,os.getuid(),os.getgid())
    def seed(self):
        (self.source/'run'/'output-0').mkdir(parents=True)
        (self.source/'run'/'manifest.json').write_text('{"version":1}')
        (self.source/'run'/'output-0'/'part.parquet').write_bytes(bytes(range(256))*100)
    def test_copy_verifies_all_bytes_and_preserves_source(self):
        self.seed();before=inventory(self.source);report=self.copy()
        self.assertTrue(report['verified']);self.assertEqual(report['file_count'],2)
        self.assertEqual(before,inventory(self.target));self.assertEqual(before,inventory(self.source))
    def test_existing_destination_is_never_overwritten(self):
        self.seed();(self.target/'owned-by-user').write_text('preserve')
        with self.assertRaisesRegex(RuntimeError,'empty'):self.copy()
        self.assertEqual((self.target/'owned-by-user').read_text(),'preserve')
        self.assertEqual(len(list(self.target.iterdir())),1)
    def test_empty_source_does_not_become_new_storage(self):
        with self.assertRaisesRegex(RuntimeError,'no files'):self.copy()
        self.assertEqual(list(self.target.iterdir()),[])
    def test_symlinks_do_not_copy_data_outside_source(self):
        self.seed();outside=self.root/'private';outside.write_text('not a source artifact')
        (self.source/'link').symlink_to(outside)
        with self.assertRaisesRegex(RuntimeError,'symlink'):self.copy()
        self.assertEqual(list(self.target.iterdir()),[])


if __name__=='__main__':unittest.main()
