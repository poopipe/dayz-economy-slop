"""Tests for standard vs Namalsk types.xml format helpers and export shape."""

import unittest
import xml.etree.ElementTree as ET

import types_format


class TierMappingTest(unittest.TestCase):
    def test_expand_tier234(self):
        self.assertEqual(
            types_format.expand_tier_user_attr('Tier234'),
            ['Tier2', 'Tier3', 'Tier4'],
        )

    def test_expand_tier34(self):
        self.assertEqual(
            types_format.expand_tier_user_attr('Tier34'),
            ['Tier3', 'Tier4'],
        )

    def test_collapse_tier234(self):
        user, non_tier = types_format.collapse_tier_values(['Tier2', 'Tier4', 'Tier3'])
        self.assertEqual(user, 'Tier234')
        self.assertEqual(non_tier, [])

    def test_collapse_with_non_tier(self):
        user, non_tier = types_format.collapse_tier_values(['Tier1', 'Special'])
        self.assertEqual(user, 'Tier1')
        self.assertEqual(non_tier, ['Special'])


class UsageNamalskMappingTest(unittest.TestCase):
    def test_forward_map(self):
        self.assertEqual(types_format.usage_name_to_namalsk_tag('Town'), 'civilian')
        self.assertEqual(types_format.usage_name_to_namalsk_tag('Village'), 'civilian')
        self.assertEqual(types_format.usage_name_to_namalsk_tag('Coast'), 'fishing')
        self.assertEqual(types_format.usage_name_to_namalsk_tag('ContaminatedArea'), 'military')
        self.assertEqual(types_format.usage_name_to_namalsk_tag('Prison'), 'police')
        self.assertEqual(types_format.usage_name_to_namalsk_tag('Medic'), 'medical')

    def test_reverse_canonical(self):
        self.assertEqual(types_format.namalsk_tag_to_canonical_usage('civilian'), 'Town')
        self.assertEqual(types_format.namalsk_tag_to_canonical_usage('seaice'), 'Coast')
        self.assertEqual(types_format.namalsk_tag_to_canonical_usage('fishing'), 'Coast')
        self.assertEqual(types_format.namalsk_tag_to_canonical_usage('medical'), 'Medic')

    def test_derive_namalsk_tags_from_usages(self):
        tags, unmapped = types_format.derive_namalsk_tags_from_usages(
            ['Town', 'Village', 'Military', 'UnknownSpot']
        )
        self.assertEqual(tags, ['civilian', 'military'])
        self.assertEqual(unmapped, ['UnknownSpot'])

    def test_derive_usages_from_namalsk_tags(self):
        usages, unknown = types_format.derive_usages_from_namalsk_tags(
            ['civilian', 'seaice', 'nope']
        )
        self.assertEqual(usages, ['Town', 'Coast'])
        self.assertEqual(unknown, ['nope'])


class DetectFormatTest(unittest.TestCase):
    def test_standard(self):
        root = ET.fromstring('''
        <types>
          <type name="AK101">
            <usage name="Military" />
            <value name="Tier3" />
            <value name="Tier4" />
          </type>
        </types>
        ''')
        self.assertEqual(types_format.detect_types_format(root), 'standard')

    def test_namalsk(self):
        root = ET.fromstring('''
        <types>
          <type name="AK101">
            <usage />
            <value user="Tier34" />
            <tag name="military" />
          </type>
        </types>
        ''')
        self.assertEqual(types_format.detect_types_format(root), 'namalsk')

    def test_mixed(self):
        root = ET.fromstring('''
        <types>
          <type name="A">
            <usage name="Military" />
            <value name="Tier3" />
          </type>
          <type name="B">
            <usage />
            <value user="Tier34" />
            <tag name="military" />
          </type>
        </types>
        ''')
        self.assertEqual(types_format.detect_types_format(root), 'mixed')


class NormalizeTest(unittest.TestCase):
    def test_namalsk_extracts_tags_and_fills_canonical_usages(self):
        elem = {
            'name': 'AK101',
            'value': [{'user': 'Tier34'}],
            'tag': [{'name': 'military'}],
            'usage': [{}],
        }
        result = types_format.normalize_type_element_to_standard(
            elem, 'namalsk', {'military': 'Military'}
        )
        self.assertEqual(result['value'], [{'name': 'Tier3'}, {'name': 'Tier4'}])
        self.assertEqual(result['_namalsk_tags'], ['military'])
        self.assertEqual(result['usage'], [{'name': 'Military'}])
        self.assertNotIn('tag', result)

    def test_namalsk_civilian_fills_town(self):
        elem = {
            'name': 'Apple',
            'tag': [{'name': 'civilian'}],
        }
        result = types_format.normalize_type_element_to_standard(elem, 'namalsk')
        self.assertEqual(result['_namalsk_tags'], ['civilian'])
        self.assertEqual(result['usage'], [{'name': 'Town'}])

    def test_standard_passthrough(self):
        elem = {
            'name': 'AK101',
            'value': [{'name': 'Tier3'}],
            'usage': [{'name': 'Farm'}],
            'tag': [{'name': 'shelves'}],
        }
        result = types_format.normalize_type_element_to_standard(elem, 'standard')
        self.assertEqual(result['value'], [{'name': 'Tier3'}])
        self.assertEqual(result['usage'], [{'name': 'Farm'}])
        self.assertEqual(result['tag'], [{'name': 'shelves'}])
        self.assertNotIn('_namalsk_tags', result)


class NamalskExportShapeTest(unittest.TestCase):
    def test_stored_namalsk_tags_win(self):
        warnings = []
        tags = types_format.resolve_namalsk_export_tags(
            ['seaice'],
            ['Town', 'Military'],
            warnings=warnings,
            element_name='X',
        )
        self.assertEqual(tags, ['seaice'])
        self.assertEqual(warnings, [])

    def test_empty_namalsk_tags_derive_from_usages(self):
        warnings = []
        tags = types_format.resolve_namalsk_export_tags(
            [],
            ['Town', 'Village', 'Coast'],
            warnings=warnings,
            element_name='X',
        )
        self.assertEqual(tags, ['civilian', 'fishing'])

    def test_export_omits_native_tags_and_uses_stored(self):
        elem = ET.Element('type', name='AK101')
        flags = ET.Element('flags')
        flags.set('count_in_map', '1')
        elem.append(flags)

        warnings = []
        types_format.append_namalsk_type_children(
            elem,
            {
                'name': 'AK101',
                'category': [{'name': 'rifles'}],
                'usage': [{'name': 'Military'}],
                'value': [{'name': 'Tier3'}, {'name': 'Tier4'}],
                '_namalsk_tags': ['military'],
                'tag': [{'name': 'shelves'}],
            },
            warnings=warnings,
        )

        tags = [c for c in list(elem) if c.tag == 'tag']
        usages = [c for c in list(elem) if c.tag == 'usage']
        values = [c for c in list(elem) if c.tag == 'value']

        self.assertEqual(len(usages), 1)
        self.assertIsNone(usages[0].get('name'))
        self.assertEqual(len(values), 1)
        self.assertEqual(values[0].get('user'), 'Tier34')
        self.assertEqual([t.get('name') for t in tags], ['military'])
        self.assertNotIn('shelves', [t.get('name') for t in tags])

    def test_standard_export_usages_prefer_stored(self):
        usages = types_format.resolve_standard_export_usages(
            ['Town'],
            ['military'],
            warnings=[],
        )
        self.assertEqual(usages, ['Town'])

    def test_standard_export_usages_derive_from_namalsk(self):
        usages = types_format.resolve_standard_export_usages(
            [],
            ['civilian', 'seaice'],
            warnings=[],
        )
        self.assertEqual(usages, ['Town', 'Coast'])


if __name__ == '__main__':
    unittest.main()
