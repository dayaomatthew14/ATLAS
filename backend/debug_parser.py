
import pandas as pd
file_path = r'C:\Users\mtthw\Downloads\BSCS CURRICULUM AY 2026.xlsx'
xls = pd.ExcelFile(file_path)
for sheet_name in xls.sheet_names:
    df = pd.read_excel(xls, sheet_name=sheet_name)
    current_year = None
    current_sem = '1st'
    for index, row in df.iterrows():
        row_str = str(row.values).upper()
        if 'FIRST YEAR' in row_str: current_year = 1
        elif 'SECOND YEAR' in row_str: current_year = 2
        elif 'THIRD YEAR' in row_str: current_year = 3
        elif 'FOURTH YEAR' in row_str: current_year = 4
        elif 'FIFTH YEAR' in row_str: current_year = 5
        
        if 'FIRST TERM' in row_str or '1ST TERM' in row_str or 'FIRST SEMESTER' in row_str or '1ST SEMESTER' in row_str: current_sem = '1st'
        elif 'SECOND TERM' in row_str or '2ND TERM' in row_str or 'SECOND SEMESTER' in row_str or '2ND SEMESTER' in row_str: current_sem = '2nd'
        elif 'THIRD TERM' in row_str or '3RD TERM' in row_str or 'SUMMER' in row_str: current_sem = 'summer'
        
        cleaned = [str(x).strip() for x in row.values if pd.notna(x) and str(x).strip() != '']
        if len(cleaned) >= 3:
            number_start_idx = -1
            for i in range(1, len(cleaned)):
                val = cleaned[i].replace('.0', '')
                if val.isdigit():
                    number_start_idx = i
                    break
            if number_start_idx >= 2:
                title = cleaned[number_start_idx - 1]
                code = cleaned[number_start_idx - 2]
                num_list = []
                idx = number_start_idx
                while idx < len(cleaned):
                    val = cleaned[idx].replace('.0', '')
                    if val.isdigit(): num_list.append(int(val)); idx += 1
                    else: break
                if len(num_list) >= 3:
                    lec, lab, units = num_list[0], num_list[1], num_list[2]
                elif len(num_list) >= 1:
                    units, lec, lab = num_list[-1], 0, 0
                else: continue
                pre_req = ' '.join(cleaned[idx:]) if idx < len(cleaned) else ''
                if len(code) > 20 or len(title) < 3 or 'CODE' in code.upper() or 'YEAR' in code.upper(): continue
                print(f'Y{current_year} S{current_sem} | {code} | {title} | L{lec} B{lab} U{units} | PR:{pre_req}')

