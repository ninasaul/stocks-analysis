"""内存管理模块"""
from typing import List, Tuple, Dict, Any


class SimpleMemory:
    """简单内存管理类"""

    def __init__(self, max_size: int = 100):
        """
        初始化内存
        
        Args:
            max_size: 内存最大容量
        """
        self.max_size = max_size
        self.memories: List[Tuple[str, Any]] = []

    def add_situations(self, situations: List[Tuple[str, Any]]):
        """
        添加情境到内存
        
        Args:
            situations: 情境列表，每个情境是 (情境描述, 分析结果) 的元组
        """
        self.memories.extend(situations)
        
        # 保持内存大小在限制范围内
        if len(self.memories) > self.max_size:
            self.memories = self.memories[-self.max_size:]

    def get_relevant_memories(self, query: str, top_k: int = 5) -> List[Tuple[str, Any]]:
        """
        获取相关内存
        
        Args:
            query: 查询字符串
            top_k: 返回的最大数量
        
        Returns:
            相关内存列表
        """
        # 简单的基于关键词匹配的相关性计算
        relevant = []
        for situation, analysis in self.memories:
            if query in situation:
                relevant.append((situation, analysis))
        
        return relevant[:top_k]

    def clear(self):
        """清空内存"""
        self.memories = []

    def __len__(self) -> int:
        """返回内存大小"""
        return len(self.memories)