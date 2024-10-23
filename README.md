# Printer



# Finne printer på mac:
```zsh
ls /dev/tty.* 
ls /dev/cu.* 
# Aner ikke forskjellen her^
```

# Sette opp python

```zsh
# Lage venv
python3 -m venv ./venv

# installer deps
./venv/bin/pip3 install escpos image watchdog numpy

# Kjør main
./venv/bin/python3 main.py 
```


