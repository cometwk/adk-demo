import re
import os

# Read SQL content from reactgo.sql file
with open("reactgo.sql", "r", encoding="utf-8") as f:
    sql_content = f.read()

tables = {}
current_table_name = None
current_table_content = []

lines = sql_content.splitlines()

for line in lines:
    if line.strip() == "START TRANSACTION;" or line.strip() == "COMMIT;":
        continue

    # Detect the start of a new table definition (DROP TABLE comment or CREATE TABLE statement)
    drop_table_match = re.match(r'^-- DROP TABLE IF EXISTS `(\w+)`;$', line)
    create_table_match = re.match(r'^CREATE TABLE IF NOT EXISTS `(\w+)`', line)

    if drop_table_match or create_table_match:
        if current_table_name and current_table_content:
            tables[current_table_name] = "\n".join(current_table_content).strip() + "\n"
            
        current_table_content = []
        if drop_table_match:
            current_table_name = drop_table_match.group(1)
            current_table_content.append(line)
        elif create_table_match:
            current_table_name = create_table_match.group(1)
            # Add the DROP TABLE comment if it wasn't already added
            drop_comment = f"-- DROP TABLE IF EXISTS `{current_table_name}`";
            if not current_table_content or (len(current_table_content) > 0 and current_table_content[-1].strip() != drop_comment.strip()):
                current_table_content.append(drop_comment)
            current_table_content.append(line)
    elif current_table_name:
        current_table_content.append(line)

# Add the last table
if current_table_name and current_table_content:
    tables[current_table_name] = "\n".join(current_table_content).strip() + "\n"

# Create a directory for the new SQL files if it doesn't exist
output_dir = "."
os.makedirs(output_dir, exist_ok=True)

# Write each table's content to a separate file
for table_name, content in tables.items():
    file_name = os.path.join(output_dir, f"{table_name}.sql")
    with open(file_name, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Created file: {file_name}")