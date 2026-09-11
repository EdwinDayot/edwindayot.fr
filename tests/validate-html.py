from html.parser import HTMLParser
from pathlib import Path

class Validator(HTMLParser):
    void = set('area base br col embed hr img input link meta param source track wbr'.split())
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
    def handle_starttag(self, tag, attrs):
        if tag not in self.void:
            self.stack.append(tag)
    def handle_startendtag(self, tag, attrs):
        pass
    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, f'Closing {tag} inside {self.stack}'
        self.stack.pop()

for path in [Path('public/index.html'), Path('public/portfolio/index.html')]:
    validator = Validator()
    validator.feed(path.read_text())
    assert not validator.stack, validator.stack
    print(f'PASS balanced HTML: {path}')
