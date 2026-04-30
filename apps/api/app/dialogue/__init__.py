from app.dialogue.manager import DialogueManager

_dialogue_manager_instance = None

def _get_dialogue_manager():
    """延迟获取 dialogue_manager 单例"""
    global _dialogue_manager_instance
    if _dialogue_manager_instance is None:
        _dialogue_manager_instance = DialogueManager()
    return _dialogue_manager_instance

dialogue_manager = _get_dialogue_manager()

__all__ = ['dialogue_manager']