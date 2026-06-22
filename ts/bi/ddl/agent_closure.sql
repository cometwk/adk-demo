-- DROP TABLE IF EXISTS agent_closure;

CREATE TABLE IF NOT EXISTS agent_closure (
  ancestor_id BIGINT NOT NULL,
  descendant_id BIGINT NOT NULL,
  depth INT NOT NULL,

  PRIMARY KEY (ancestor_id, descendant_id),

  INDEX idx_descendant (descendant_id),
  INDEX idx_ancestor (ancestor_id)
) COMMENT='代理商层级关系';
