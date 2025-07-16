from escpos.printer import Network

PRINTER_IP = "192.168.0.237"

print(f"Connecting to printer at {PRINTER_IP}")
printer = Network(PRINTER_IP)
print("Printer connected successfully")

printer.text("Hello world")
printer.ln(1)
printer.cut()

