import argparse
import xml.etree.ElementTree as ET
import pathlib
import os

class FBDataModel:
    def __init__(self, name, comment=""):
        self.name = name
        self.comment = comment
        self.event_inputs = []
        self.event_outputs = []
        self.input_vars = []
        self.output_vars = []

def parse_fbt_xml(xml_content_or_path):
    if os.path.exists(xml_content_or_path):
        tree = ET.parse(xml_content_or_path) 
        root = tree.getroot() 
    else:
        root = ET.fromstring(xml_content_or_path) 

    fb_name = root.attrib.get('Name', 'UnnamedFB')
    fb_comment = root.attrib.get('Comment', '')
    
    fb_model = FBDataModel(fb_name, fb_comment)
    
    interface = root.find('InterfaceList') 
    if interface is None:
        return fb_model

    event_in = interface.find('EventInputs')
    if event_in is not None:
        fb_model.event_inputs = [ev.attrib.get('Name') for ev in event_in.findall('Event')]

    event_out = interface.find('EventOutputs')
    if event_out is not None:
        fb_model.event_outputs = [ev.attrib.get('Name') for ev in event_out.findall('Event')]

    input_vars = interface.find('InputVars')
    if input_vars is not None:
        fb_model.input_vars = [
            {"name": var.attrib.get('Name'), "type": var.attrib.get('Type')}
            for var in input_vars.findall('VarDeclaration')
        ]

    output_vars = interface.find('OutputVars')
    if output_vars is not None:
        fb_model.output_vars = [
            {"name": var.attrib.get('Name'), "type": var.attrib.get('Type')}
            for var in output_vars.findall('VarDeclaration')
        ]

    return fb_model

def generate_python_class(fb_model):
    class_src = f'import logging\n\n'
    class_src += f'class {fb_model.name}:\n'
    class_src += f'    """ {fb_model.comment} """\n\n'
    
    class_src += '    def __init__(self):\n'
    class_src += '        # Input Variables\n'
    for var in fb_model.input_vars:
        default_val = "False" if var['type'] == "BOOL" else "0"
        if var['type'] == "STRING":
           default_val = "''"          
        class_src += f"        self.{var['name']} = {default_val}  # Type: {var['type']}\n"

    class_src += '\n        # Output Variables\n'
    for var in fb_model.output_vars:
        default_val = "False" if var['type'] == "BOOL" else "0"
        class_src += f"        self.{var['name']} = {default_val}  # Type: {var['type']}\n"

    class_src += '\n    def __del__(self):\n'
    class_src += '        # TODO Insert your code here \n'
    class_src += '        pass \n'

    for event in fb_model.event_inputs:
        class_src += f'\n    def service_{event}(self):\n'
        class_src += f'        """ Event Handler for {event} """\n'
        class_src += f'        logging.info("Execution logic for {event} triggered")\n'
        class_src += f'        # Implement internal algorithms here\n'
        
    class_src += f'\n    def schedule(self, IN_EVENT_NAME, EVNT_CNTR,'
    for var in fb_model.input_vars:
        class_src += f"{var['name']},"
    class_src = class_src.rstrip(',') + '): \n'    

    for var in fb_model.input_vars:
        class_src += f"        self.{var['name']} = {var['name']}\n"

    class_src += '\n'    

    for event in fb_model.event_inputs:
        class_src += f'        if IN_EVENT_NAME == \"{event}\":\n'
        class_src += f'            self.service_{event}()\n'
        class_src += f'            return '
        for ev in fb_model.event_inputs:
            if ev == event:
                class_src += f'EVNT_CNTR,'
            else:
                class_src += f'None,'
        for var in fb_model.output_vars:
            class_src += f"self.{var['name']},"
        class_src = class_src.rstrip(',') + '\n'
        
    return class_src

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert fbt to py file.")
    parser.add_argument("filename", type=str, help="The name of the fbt file to open")

    args = parser.parse_args()

    with open(args.filename, 'r', encoding='utf-8') as file:
      file_content = file.read()

    parsed_fb = parse_fbt_xml(file_content)
    generated_code = generate_python_class(parsed_fb)
    
    fbtname = pathlib.Path(args.filename).stem

    output_path = pathlib.Path(args.filename).with_suffix('.py')
    with open(output_path, "w", encoding="utf-8") as file:
       file.write(generated_code)
    
    print(f"Generated {output_path}")
