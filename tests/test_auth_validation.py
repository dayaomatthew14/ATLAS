"""
Tests for descriptive auth registration & profile validation error messages.
"""

import unittest
from pydantic import ValidationError

from backend.app import schemas


class AuthValidationMessagesTest(unittest.TestCase):
    def _base_user_kwargs(self, **overrides):
        data = {
            "email": "juan.delacruz@dlsau.edu.ph",
            "first_name": "Juan",
            "last_name": "Dela Cruz",
            "contact_number": "09123456789",
            "role": "program_chair",
            "department": "CAST",
            "password": "ValidPassword12",
        }
        data.update(overrides)
        return data

    def test_valid_names_including_philippine_characters(self):
        for fname, lname in [
            ("Juan", "Dela Cruz-Santos"),
            ("Ma. Teresa", "Peña"),
            ("José", "O'Brien"),
            ("Antonio Jr.", "Muñoz"),
        ]:
            user = schemas.UserCreate(**self._base_user_kwargs(first_name=fname, last_name=lname))
            self.assertEqual(user.first_name, fname)
            self.assertEqual(user.last_name, lname)

    def test_name_with_numbers_reports_numbers_issue(self):
        with self.assertRaises(ValidationError) as ctx:
            schemas.UserCreate(**self._base_user_kwargs(first_name="Juan123"))
        msg = str(ctx.exception)
        self.assertIn("First Name cannot contain numbers", msg)

    def test_name_with_symbols_reports_symbols_issue(self):
        with self.assertRaises(ValidationError) as ctx:
            schemas.UserCreate(**self._base_user_kwargs(last_name="Cruz@!"))
        msg = str(ctx.exception)
        self.assertIn("Last Name cannot contain symbols", msg)
        self.assertIn("@", msg)

    def test_name_with_numbers_and_symbols_reports_both(self):
        with self.assertRaises(ValidationError) as ctx:
            schemas.UserCreate(**self._base_user_kwargs(first_name="J4n$"))
        msg = str(ctx.exception)
        self.assertIn("cannot contain numbers or special symbols", msg)

    def test_name_starting_with_punctuation_reports_letter_requirement(self):
        with self.assertRaises(ValidationError) as ctx:
            schemas.UserCreate(**self._base_user_kwargs(first_name=".Juan"))
        msg = str(ctx.exception)
        self.assertIn("First Name must start with a letter", msg)

    def test_blank_name_reports_required(self):
        with self.assertRaises(ValidationError) as ctx:
            schemas.UserCreate(**self._base_user_kwargs(first_name="   "))
        self.assertIn("First Name is required", str(ctx.exception))

    def test_contact_number_allows_spaces_and_dashes_and_normalizes(self):
        user = schemas.UserCreate(**self._base_user_kwargs(contact_number="0912 345 6789"))
        self.assertEqual(user.contact_number, "09123456789")

        user_dash = schemas.UserCreate(**self._base_user_kwargs(contact_number="+63 912-345-6789"))
        self.assertEqual(user_dash.contact_number, "+639123456789")

    def test_contact_number_diagnostic_errors(self):
        with self.assertRaises(ValidationError) as ctx_alpha:
            schemas.UserCreate(**self._base_user_kwargs(contact_number="0912abc6789"))
        self.assertIn("cannot contain letters", str(ctx_alpha.exception))

        with self.assertRaises(ValidationError) as ctx_prefix:
            schemas.UserCreate(**self._base_user_kwargs(contact_number="08123456789"))
        self.assertIn("must start with 09 or +639", str(ctx_prefix.exception))

        with self.assertRaises(ValidationError) as ctx_len:
            schemas.UserCreate(**self._base_user_kwargs(contact_number="091234567"))
        self.assertIn("11 digits", str(ctx_len.exception))

    def test_user_update_uses_same_readable_validators(self):
        with self.assertRaises(ValidationError) as ctx:
            schemas.UserUpdate(first_name="Anna9")
        self.assertIn("First Name cannot contain numbers", str(ctx.exception))

        upd = schemas.UserUpdate(first_name="Peña", contact_number="0917-123-4567")
        self.assertEqual(upd.first_name, "Peña")
        self.assertEqual(upd.contact_number, "09171234567")


if __name__ == "__main__":
    unittest.main()

