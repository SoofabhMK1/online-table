"""workbook_service 纯函数单测（无需 DB）。"""
import pytest

from app.models import Template
from app.services import workbook_service


class TestIsNumeric:
    def test_int(self):
        assert workbook_service.is_numeric(0) is True
        assert workbook_service.is_numeric(42) is True
        assert workbook_service.is_numeric(-7) is True

    def test_float(self):
        assert workbook_service.is_numeric(0.0) is True
        assert workbook_service.is_numeric(-3.14) is True
        assert workbook_service.is_numeric(1.5e3) is True

    def test_bool_rejected(self):
        # Python bool 是 int 的子类，必须显式排除
        assert workbook_service.is_numeric(True) is False
        assert workbook_service.is_numeric(False) is False

    def test_str_integer(self):
        assert workbook_service.is_numeric("0") is True
        assert workbook_service.is_numeric("42") is True
        assert workbook_service.is_numeric("-7") is True

    def test_str_float(self):
        assert workbook_service.is_numeric("0.0") is True
        assert workbook_service.is_numeric("-3.14") is True
        # 科学计数法（1.5e3 = 1500）当前不接受：Univer 通常以十进制传递
        assert workbook_service.is_numeric("1.5e3") is False

    def test_str_thousands_separator(self):
        assert workbook_service.is_numeric("1,234") is True
        assert workbook_service.is_numeric("1,234,567") is True
        assert workbook_service.is_numeric("1,234.56") is True
        assert workbook_service.is_numeric("-1,234.56") is True

    def test_str_ambiguous_thousands_rejected(self):
        # 关键修复：之前 value.replace(",", "") 会让 "1,2" → 12 误判通过
        assert workbook_service.is_numeric("1,2") is False
        assert workbook_service.is_numeric("1,2,3") is False
        assert workbook_service.is_numeric(",1") is False
        assert workbook_service.is_numeric("1,") is False

    def test_str_empty(self):
        # 当前实现：空串返回 False（与 caller 的 `v in (None, "")` 跳过逻辑配合）。
        # 校验流程会在调用 is_numeric 前先过滤空值。
        assert workbook_service.is_numeric("") is False

    def test_non_numeric_strings(self):
        assert workbook_service.is_numeric("abc") is False
        assert workbook_service.is_numeric("1.2.3") is False
        assert workbook_service.is_numeric("12a") is False
        assert workbook_service.is_numeric("NaN") is False

    def test_other_types(self):
        assert workbook_service.is_numeric(None) is False
        assert workbook_service.is_numeric([]) is False
        assert workbook_service.is_numeric({}) is False


class TestColIndexToLetter:
    def test_single_letter(self):
        assert workbook_service.col_index_to_letter(0) == "A"
        assert workbook_service.col_index_to_letter(1) == "B"
        assert workbook_service.col_index_to_letter(25) == "Z"

    def test_double_letter(self):
        assert workbook_service.col_index_to_letter(26) == "AA"
        assert workbook_service.col_index_to_letter(27) == "AB"
        assert workbook_service.col_index_to_letter(51) == "AZ"
        assert workbook_service.col_index_to_letter(52) == "BA"

    def test_excel_limit(self):
        # XFD 是 Excel 最大列（index 16383）
        assert workbook_service.col_index_to_letter(16383) == "XFD"


def _make_template(**overrides) -> Template:
    base = dict(
        row_label_cols=1,
        col_label_rows=1,
        content_rows=2,
        content_cols=2,
        content_numeric=True,
    )
    base.update(overrides)
    return Template(**base)


class TestIterContentArea:
    def test_basic_rectangle(self):
        template = _make_template(
            row_label_cols=1, col_label_rows=1, content_rows=2, content_cols=3
        )
        coords = list(workbook_service.iter_content_area(template))
        # row in [1, 2], col in [1, 2, 3] → 6 个
        assert coords == [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3)]

    def test_zero_size(self):
        template = _make_template(content_rows=0, content_cols=0)
        assert list(workbook_service.iter_content_area(template)) == []


class TestValidateContentNumeric:
    def _snap(self, cells: dict) -> dict:
        """构造最小可用 Univer snapshot：单 sheet + cellData。"""
        return {
            "sheets": {
                "s1": {"id": "s1", "cellData": cells},
            },
        }

    def test_passes_when_all_numeric(self):
        template = _make_template(content_numeric=True)
        snap = self._snap({
            "0": {"1": {"v": "1"}, "2": {"v": "2.5"}},
            "1": {"1": {"v": "1,234"}},
        })
        # 内容区是 row 1..2 col 1..2（即 "1": "1", "2": "1,234"）
        # 0 行不在内容区里
        workbook_service.validate_content_numeric(snap, template)

    def test_rejects_non_numeric(self):
        template = _make_template(content_numeric=True)
        snap = self._snap({
            "1": {"1": {"v": "abc"}},
        })
        with pytest.raises(Exception) as exc_info:
            workbook_service.validate_content_numeric(snap, template)
        # 业务抛 HTTPException，detail 含需为数字
        assert "需为数字" in str(exc_info.value.detail)

    def test_skips_when_disabled(self):
        template = _make_template(content_numeric=False)
        snap = self._snap({"1": {"1": {"v": "abc"}}})  # 非数字但模板不校验
        workbook_service.validate_content_numeric(snap, template)  # 不抛

    def test_skips_empty_cells(self):
        template = _make_template(content_numeric=True)
        snap = self._snap({
            "1": {"1": {"v": ""}},  # 空 → 跳过
            "2": {"2": {}},  # 缺 v → 跳过
        })
        workbook_service.validate_content_numeric(snap, template)