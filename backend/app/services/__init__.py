"""__init__ for services package — re-export常用 helpers 以便 router 简写。"""
from app.services import role_service, template_service, workbook_service

__all__ = ["role_service", "template_service", "workbook_service"]